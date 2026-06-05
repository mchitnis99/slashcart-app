import {
  isRelevant,
  isSpecialty,
  extractBrands,
  passesBrandCheck,
  passesNegativeKeywords,
  getCategoryMinPrice,
  isStoreBrand,
  hasVariantKeyword,
  VARIANT_GROUPS,
} from "@/lib/scrapers/filters";
import { parseSize, toComparableSize } from "@/lib/utils/parseSize";

// Returns the first variant group keyword found in text (longest phrases checked first).
function extractVariantKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  const keywords = VARIANT_GROUPS.flat().sort((a, b) => b.length - a.length);
  return keywords.find((k) => lower.includes(k)) ?? null;
}

export type AmazonResult = {
  name: string;
  price: number;
  inStock: boolean;
  asin: string | null;
  imageUrl: string | null;
  regularPrice: number | null;
  bulkPrice: number | null;
  bulkQuantity: number | null;
  bulkAsin: string | null;
};

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 && raw < 10000 ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return !isNaN(n) && n > 0 && n < 10000 ? n : null;
  }
  return null;
}

// "count"/"ct" are container-size descriptors (e.g. "112 count tub"), not multipack indicators.
// Only "pack", "multipack", and "case" signal a true multi-unit purchase.
const BULK_RE = /\b(pack|multipack|case)\b/i;

function parseBulkQuantity(title: string): number | null {
  const match = title.match(/(\d+)[- ]?(?:pack|case)|(?:pack|case)\s+of\s+(\d+)/i);
  if (!match) return null;
  return parseInt(match[1] ?? match[2], 10);
}

function toStringOrNull(val: unknown): string | null {
  if (typeof val === "string" && val.length > 0) return val;
  return null;
}

export async function scrapeAmazonPrice(itemName: string, pricePaid?: number, preferredVariant?: string): Promise<AmazonResult[] | null> {
  const apiKey = process.env.SCRAPERAPI_KEY ?? "";

  // Append a variant keyword to the search query when one is known but not already
  // present in the item name (e.g. "Tonnino tuna" + "olive oil" → "Tonnino tuna olive oil").
  const variantKeyword = extractVariantKeyword(itemName) ?? preferredVariant ?? null;
  const searchQuery =
    variantKeyword && !itemName.toLowerCase().includes(variantKeyword)
      ? `${itemName} ${variantKeyword}`
      : itemName;
  const url =
    `https://api.scraperapi.com/structured/amazon/search` +
    `?api_key=${apiKey}&query=${encodeURIComponent(searchQuery)}&country=us`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error(`[amazon] Network error for "${itemName}":`, err);
    return null;
  }

  console.log(`[amazon] Status: ${response.status} for "${itemName}"`);
  if (!response.ok) {
    console.error(`[amazon] Error: ${response.status} ${response.statusText}`);
    return null;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    console.error(`[amazon] Failed to parse JSON for "${itemName}":`, err);
    return null;
  }

  const data = json as Record<string, unknown>;
  const results = (data.results ?? data.organic_results ?? []) as Record<string, unknown>[];

  console.log(`[amazon] Got ${results.length} results for "${itemName}" (pricePaid=${pricePaid ?? "none"})`);

  const brands = extractBrands(itemName);
  const hasBrand = brands.length > 0;
  const categoryMin = getCategoryMinPrice(itemName);
  const queryNorm = toComparableSize(parseSize(searchQuery));

  type Candidate = { result: Record<string, unknown>; price: number; asin: string | null };
  const standard: Candidate[] = [];
  const specialty: Candidate[] = [];
  const tooBig: Candidate[] = [];
  const tooSmall: Candidate[] = [];

  for (const result of results) {
    const title = String(result.name ?? result.title ?? "");

    // Bulk listings are handled in a separate pass below
    if (BULK_RE.test(title)) continue;

    // Rule 4: log no-price results
    const price = parsePrice(result.price);
    if (!isRelevant(title, itemName, "amazon")) continue;
    if (price === null) {
      console.log(`[amazon] [NO-PRICE] "${title}" (query: "${itemName}")`);
      continue;
    }

    if (!passesNegativeKeywords(title, itemName, "amazon")) continue;

    // Query size filter: when the query specifies a size, reject results whose parsed
    // size differs by more than 20% (only when both sides have a parseable size).
    if (queryNorm) {
      const resultNorm = toComparableSize(parseSize(title));
      if (resultNorm && resultNorm.unit === queryNorm.unit) {
        const ratio = resultNorm.quantity / queryNorm.quantity;
        if (ratio < 0.8 || ratio > 1.2) {
          console.log(`[amazon] SIZE-REJECT: query specifies ${parseFloat(queryNorm.quantity.toFixed(2))}${queryNorm.unit}, result has ${parseFloat(resultNorm.quantity.toFixed(2))}${resultNorm.unit} ("${title}")`);
          continue;
        }
      }
    }

    // Size sanity checks
    if (pricePaid && price < pricePaid * 0.50) {
      console.log(`[amazon] [TOO-SMALL] "${title}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooSmall.push({ result, price, asin: toStringOrNull(result.asin ?? result.product_id) });
      continue;
    }
    if (categoryMin !== null && price < categoryMin) {
      console.log(`[amazon] [TOO-SMALL] "${title}" @ $${price} (category floor $${categoryMin}) (query: "${itemName}")`);
      tooSmall.push({ result, price, asin: toStringOrNull(result.asin ?? result.product_id) });
      continue;
    }
    if (pricePaid && price > pricePaid * 2.00) {
      console.log(`[amazon] [TOO-BIG] "${title}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooBig.push({ result, price, asin: toStringOrNull(result.asin ?? result.product_id) });
      continue;
    }

    // Rule 1 & 2: Brand enforcement — only for branded queries
    if (hasBrand) {
      if (!passesBrandCheck(title, brands)) {
        const inferredBrand = title.split(/\s+/).slice(0, 3).join(" ");
        if (isStoreBrand(title)) {
          console.log(`[amazon] [BRAND-SKIP] store brand substitution rejected: "${inferredBrand}" for branded query "${itemName}"`);
        } else {
          console.log(`[amazon] [BRAND-SKIP] brand mismatch: expected "${brands.join("/")}", got "${inferredBrand}" (query: "${itemName}")`);
        }
        continue; // Rule 5: no fallback to wrong brand
      }
    }

    // Variant check removed — all passing results are candidates; user picks via pill selector
    const special = isSpecialty(title, itemName);
    const asin = toStringOrNull(result.asin ?? result.product_id);
    console.log(`[amazon] [${special ? "SPECIALTY" : "PASS"}] "${title}" @ $${price} (query: "${itemName}")`);
    if (special) specialty.push({ result, price, asin });
    else         standard.push({ result, price, asin });
  }

  // Collect ordered candidate pool (branded: no wrong-brand fallbacks; generic: full chain)
  let pool: Candidate[];
  if (hasBrand) {
    pool = [...standard, ...specialty].sort((a, b) => a.price - b.price);
  } else {
    const ordered = [...standard, ...specialty, ...tooBig, ...tooSmall].sort((a, b) => a.price - b.price);
    if (ordered.length === 0) {
      for (const result of results) {
        const price = parsePrice(result.price);
        if (price !== null) { ordered.push({ result, price, asin: toStringOrNull(result.asin ?? result.product_id) }); break; }
      }
    }
    pool = ordered;
  }

  if (pool.length === 0) {
    console.log(`[amazon] No suitable result for "${itemName}" (hasBrand=${hasBrand}, standard=${standard.length}, specialty=${specialty.length})`);
    return null;
  }

  // Primary is always included; additional candidates only when they carry a recognizable
  // variant keyword — prevents unrelated products from appearing as pill options.
  const topCandidates: typeof pool = [pool[0]];
  for (let i = 1; i < pool.length && topCandidates.length < 3; i++) {
    const candidateTitle = String(pool[i].result.name ?? pool[i].result.title ?? itemName);
    if (hasVariantKeyword(candidateTitle)) topCandidates.push(pool[i]);
  }
  const primaryCandidate = topCandidates[0];
  const regularPrice = primaryCandidate.price;
  const regularResult = primaryCandidate.result;

  let bulkPrice: number | null = null;
  let bulkQuantity: number | null = null;
  let bulkAsin: string | null = null;
  for (const result of results) {
    const price = parsePrice(result.price);
    if (price === null) continue;
    const title = String(result.name ?? result.title ?? "");
    if (!BULK_RE.test(title)) continue;
    const qty = parseBulkQuantity(title);
    if (!qty || qty < 2 || qty > 200) continue;
    const perUnit = price / qty;
    if (perUnit >= regularPrice) continue;
    const bestBulkPerUnit = bulkPrice !== null && bulkQuantity !== null ? bulkPrice / bulkQuantity : Infinity;
    if (perUnit < bestBulkPerUnit) { bulkPrice = price; bulkQuantity = qty; bulkAsin = toStringOrNull(result.asin ?? result.product_id); }
  }

  const primaryName = String(regularResult.name ?? itemName);
  console.log(
    `[amazon] Selected "${itemName}": ${primaryName} @ $${regularPrice}` +
    (bulkPrice !== null && bulkQuantity !== null ? `, bulk: $${bulkPrice} (${bulkQuantity}-pack, $${(bulkPrice/bulkQuantity).toFixed(2)}/unit)` : "") +
    ` + ${topCandidates.length - 1} variant(s) (standard=${standard.length}, specialty=${specialty.length}, branded=${hasBrand})`
  );

  return topCandidates.map((c, idx) => {
    const name = String(c.result.name ?? itemName);
    const imageUrl = (typeof c.result.image === "string" && c.result.image) ? c.result.image
      : (typeof c.result.thumbnail === "string" && c.result.thumbnail) ? c.result.thumbnail
      : null;
    if (!imageUrl && idx === 0) {
      console.log(`[scraper] available image fields for "${name}":`, JSON.stringify({ image: c.result.image, thumbnail: c.result.thumbnail, img: c.result.img, photo: c.result.photo, picture: c.result.picture }));
    }
    return {
      name,
      price: c.price,
      inStock: true,
      asin: c.asin,
      imageUrl,
      regularPrice: c.price,
      bulkPrice: idx === 0 ? bulkPrice : null,
      bulkQuantity: idx === 0 ? bulkQuantity : null,
      bulkAsin: idx === 0 ? bulkAsin : null,
    };
  });
}
