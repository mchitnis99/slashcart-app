import {
  isRelevant,
  isSpecialty,
  extractBrands,
  passesBrandCheck,
  passesNegativeKeywords,
  getCategoryMinPrice,
  isStoreBrand,
  passesVariantCheck,
} from "@/lib/scrapers/filters";

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

export async function scrapeAmazonPrice(itemName: string, pricePaid?: number): Promise<AmazonResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY ?? "";
  const url =
    `https://api.scraperapi.com/structured/amazon/search` +
    `?api_key=${apiKey}&query=${encodeURIComponent(itemName)}&country=us`;

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

    // Rule 3: Variant mismatch (scent, formula, etc.)
    const variantConflict = passesVariantCheck(title, itemName);
    if (variantConflict !== null) {
      console.log(`[amazon] [VARIANT-SKIP] expected "${variantConflict.expectedVariant}", got "${variantConflict.foundVariant}" in "${title}" (query: "${itemName}")`);
      continue; // Rule 5: no fallback to wrong variant
    }

    const special = isSpecialty(title, itemName);
    const asin = toStringOrNull(result.asin ?? result.product_id);
    console.log(`[amazon] [${special ? "SPECIALTY" : "PASS"}] "${title}" @ $${price} (query: "${itemName}")`);
    if (special) specialty.push({ result, price, asin });
    else         standard.push({ result, price, asin });
  }

  // Rule 5: Branded queries get no wrong-brand/wrong-variant fallback.
  //         Generic queries keep the full fallback chain.
  let regularCandidate: Candidate | null = null;

  if (hasBrand) {
    // Standard → specialty only. If both empty, return null — unavailable is better than wrong.
    const pool = standard.length > 0 ? standard : specialty;
    regularCandidate = pool.length > 0 ? pool.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  } else {
    // Generic: standard → specialty → tooBig → tooSmall → first priced
    const pool = standard.length > 0 ? standard
      : specialty.length > 0 ? specialty
      : tooBig.length > 0 ? tooBig
      : tooSmall;
    regularCandidate = pool.length > 0 ? pool.reduce((a, b) => (b.price < a.price ? b : a)) : null;

    if (regularCandidate === null) {
      for (const result of results) {
        const price = parsePrice(result.price);
        if (price !== null) {
          regularCandidate = { result, price, asin: toStringOrNull(result.asin ?? result.product_id) };
          break;
        }
      }
    }
  }

  if (regularCandidate === null) {
    console.log(`[amazon] No suitable result for "${itemName}" (hasBrand=${hasBrand}, standard=${standard.length}, specialty=${specialty.length})`);
    return null;
  }

  const { result: regularResult, price: regularPrice, asin: regularAsin } = regularCandidate;

  // Find cheapest bulk variant with a lower per-unit cost than regularPrice
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
    if (perUnit < bestBulkPerUnit) {
      bulkPrice = price;
      bulkQuantity = qty;
      bulkAsin = toStringOrNull(result.asin ?? result.product_id);
    }
  }

  const name = String(regularResult.name ?? itemName);
  const imageUrl = (typeof regularResult.image === "string" && regularResult.image)
    ? regularResult.image
    : (typeof regularResult.thumbnail === "string" && regularResult.thumbnail)
    ? regularResult.thumbnail
    : null;
  console.log(
    `[amazon] Selected "${itemName}": ${name} @ $${regularPrice}` +
    (bulkPrice !== null && bulkQuantity !== null
      ? `, bulk: $${bulkPrice} (${bulkQuantity} units, $${(bulkPrice / bulkQuantity).toFixed(2)}/unit)`
      : "") +
    ` (from ${standard.length} standard, ${specialty.length} specialty, ${tooBig.length} too-big, ${tooSmall.length} too-small, branded=${hasBrand})`
  );

  return {
    name,
    price: regularPrice,
    inStock: true,
    asin: regularAsin,
    imageUrl,
    regularPrice,
    bulkPrice,
    bulkQuantity,
    bulkAsin,
  };
}
