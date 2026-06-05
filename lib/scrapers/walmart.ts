import {
  isRelevant,
  isSpecialty,
  extractBrands,
  passesBrandCheck,
  passesNegativeKeywords,
  getCategoryMinPrice,
  hasVariantKeyword,
} from "@/lib/scrapers/filters";
import { parseSize, toComparableSize } from "@/lib/utils/parseSize";

export type WalmartResult = {
  name: string;
  price: number;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
};

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 && raw < 10000 ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return !isNaN(n) && n > 0 && n < 10000 ? n : null;
  }
  return null;
}

// Units that represent physical product size (as opposed to order quantity like "count" or "pack").
const SIZE_UNITS = new Set(["oz", "fl oz", "lb", "lbs", "g", "kg", "ml"]);

export async function scrapeWalmartPrice(itemName: string, pricePaid?: number, queryQuantity?: number, queryUnit?: string): Promise<WalmartResult[] | null> {
  const apiKey = process.env.SCRAPERAPI_KEY ?? "";
  const url =
    `https://api.scraperapi.com/structured/walmart/search` +
    `?api_key=${apiKey}&query=${encodeURIComponent(itemName)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error(`[walmart] Network error for "${itemName}":`, err);
    return null;
  }

  console.log(`[walmart] Status: ${response.status} for "${itemName}"`);
  if (!response.ok) {
    console.error(`[walmart] Error: ${response.status} ${response.statusText}`);
    return null;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    console.error(`[walmart] Failed to parse JSON for "${itemName}":`, err);
    return null;
  }

  const data = json as Record<string, unknown>;
  const results = (data.results ?? data.organic_results ?? data.items ?? []) as Record<string, unknown>[];

  console.log(`[walmart] Got ${results.length} results for "${itemName}" (pricePaid=${pricePaid ?? "none"})`);

  const brands = extractBrands(itemName);
  const hasBrand = brands.length > 0;
  const categoryMin = getCategoryMinPrice(itemName);
  // parse-list strips the size from item names (rule 5), so try the explicit quantity/unit
  // first; fall back to parsing from the name for manually-entered queries that include size.
  const queryNormFromArgs = queryQuantity && queryUnit && SIZE_UNITS.has(queryUnit.toLowerCase())
    ? toComparableSize({ quantity: queryQuantity, unit: queryUnit })
    : null;
  const queryNorm = queryNormFromArgs ?? toComparableSize(parseSize(itemName));
  console.log(`[walmart] SIZE-FILTER: queryNorm=${queryNorm ? `${parseFloat(queryNorm.quantity.toFixed(2))}${queryNorm.unit}` : "inactive"} (quantity=${queryQuantity ?? "—"} unit=${queryUnit ?? "—"})`);

  type Candidate = { name: string; price: number; url: string | null; imageUrl: string | null };
  const standard: Candidate[] = [];
  const specialty: Candidate[] = [];
  const noBrand: Candidate[] = [];
  const tooBig: Candidate[] = [];
  const tooSmall: Candidate[] = [];

  for (const result of results) {
    const name = String(result.name ?? result.title ?? itemName);
    // primary_price is the shelf price; price is sometimes a per-unit price
    // (e.g. $0.72/sheet for paper towels). Keep primary_price first.
    const price = parsePrice(result.primary_price ?? result.price ?? result.sale_price);
    const resultUrl = (typeof result.url === "string" && result.url) ? result.url
                    : (typeof result.link === "string" && result.link) ? result.link
                    : null;
    const resultImageUrl = (typeof result.image === "string" && result.image) ? result.image
                         : (typeof result.thumbnail === "string" && result.thumbnail) ? result.thumbnail
                         : null;

    if (!isRelevant(name, itemName, "walmart")) continue;
    if (price === null) continue;

    if (!passesNegativeKeywords(name, itemName, "walmart")) continue;

    // Query size filter: when the query specifies a size, reject results whose parsed
    // size differs by more than 20% (only when both sides have a parseable size).
    if (queryNorm) {
      const resultNorm = toComparableSize(parseSize(name));
      const qStr = `${parseFloat(queryNorm.quantity.toFixed(2))}${queryNorm.unit}`;
      const rStr = resultNorm ? `${parseFloat(resultNorm.quantity.toFixed(2))}${resultNorm.unit}` : "no-size";
      if (resultNorm && resultNorm.unit === queryNorm.unit) {
        const ratio = resultNorm.quantity / queryNorm.quantity;
        console.log(`[walmart] SIZE-CHECK: query=${qStr} result=${rStr} ratio=${ratio.toFixed(3)} ("${name}")`);
        if (ratio < 0.8 || ratio > 1.2) {
          console.log(`[walmart] SIZE-REJECT: query specifies ${qStr}, result has ${rStr} ("${name}")`);
          continue;
        }
      } else {
        console.log(`[walmart] SIZE-CHECK: query=${qStr} result=${rStr} (skipped — unit mismatch or no size) ("${name}")`);
      }
    }

    // Sanity check: if price is < 50% of what the user paid, it's likely a travel/mini size
    if (pricePaid && price < pricePaid * 0.50) {
      console.log(`[walmart] [TOO-SMALL] "${name}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooSmall.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
      continue;
    }

    // Category price floor: catches travel sizes even without pricePaid
    if (categoryMin !== null && price < categoryMin) {
      console.log(`[walmart] [TOO-SMALL] "${name}" @ $${price} (category floor $${categoryMin}) (query: "${itemName}")`);
      tooSmall.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
      continue;
    }

    // Sanity check: if price is > 200% of what the user paid, it's likely a multi-pack or bulk
    if (pricePaid && price > pricePaid * 2.00) {
      console.log(`[walmart] [TOO-BIG] "${name}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooBig.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
      continue;
    }

    // Variant check removed — all passing results are candidates; user picks via pill selector
    // Fix 2: hard-reject brand mismatches for branded queries
    const brandOk = passesBrandCheck(name, brands);
    if (!brandOk) {
      if (hasBrand) {
        const inferredBrand = name.split(/\s+/).slice(0, 3).join(" ");
        console.log(`[walmart] BRAND-HARD-REJECT: expected "${brands.join("/")}", got "${inferredBrand}" (query: "${itemName}")`);
        continue;
      } else {
        noBrand.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
        continue;
      }
    }

    const special = isSpecialty(name, itemName);
    console.log(`[walmart] [${special ? "SPECIALTY" : "PASS"}] "${name}" @ $${price} (query: "${itemName}")`);
    if (special) specialty.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
    else         standard.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
  }

  // Collect top 3 cheapest from available pool
  const allCandidates = [...standard, ...specialty, ...noBrand, ...tooBig, ...tooSmall]
    .sort((a, b) => a.price - b.price);

  if (allCandidates.length === 0) {
    console.error(`[walmart] No relevant priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
    return null;
  }

  const topCandidates: typeof allCandidates = [allCandidates[0]];
  for (let i = 1; i < allCandidates.length && topCandidates.length < 3; i++) {
    const c = allCandidates[i];
    if (hasVariantKeyword(c.name) && !topCandidates.some((t) => t.name === c.name)) {
      topCandidates.push(c);
    }
  }
  const best = topCandidates[0];
  console.log(`[walmart] Selected: "${best.name}" @ $${best.price} + ${topCandidates.length - 1} variant(s) (standard=${standard.length}, specialty=${specialty.length}, noBrand=${noBrand.length})`);

  if (!best.imageUrl) {
    const bestRaw = results.find((r) => String(r.name ?? r.title ?? itemName) === best.name);
    if (bestRaw) {
      console.log(`[scraper] available image fields for "${best.name}":`, JSON.stringify({ image: bestRaw.image, thumbnail: bestRaw.thumbnail, img: bestRaw.img, photo: bestRaw.photo, picture: bestRaw.picture }));
    }
  }

  return topCandidates.map((c) => ({ name: c.name, price: c.price, inStock: true, url: c.url, imageUrl: c.imageUrl }));
}
