import {
  isRelevant,
  isSpecialty,
  extractBrands,
  passesBrandCheck,
  passesNegativeKeywords,
} from "@/lib/scrapers/filters";

export type AmazonResult = {
  name: string;
  price: number;
  inStock: boolean;
  asin: string | null;
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

  console.log(`[amazon] Got ${results.length} results for "${itemName}"`);

  const brands = extractBrands(itemName);

  type Candidate = { result: Record<string, unknown>; price: number; asin: string | null };
  const standard: Candidate[] = [];
  const specialty: Candidate[] = [];
  const noBrand: Candidate[] = [];
  const tooBig: Candidate[] = [];
  const tooSmall: Candidate[] = [];

  for (const result of results) {
    const price = parsePrice(result.price);
    const title = String(result.name ?? result.title ?? "");

    // Bulk listings are handled in a separate pass below
    if (BULK_RE.test(title)) continue;

    if (!isRelevant(title, itemName)) {
      console.log(`[amazon] [FAIL] "${title}" @ ${price !== null ? `$${price}` : "no price"} (query: "${itemName}")`);
      continue;
    }
    if (price === null) continue;

    if (!passesNegativeKeywords(title, itemName, "amazon")) continue;

    // Sanity check: if price is < 50% of what the user paid, it's likely a travel/mini size
    if (pricePaid && price < pricePaid * 0.50) {
      console.log(`[amazon] [TOO-SMALL] "${title}" @ $${price} (pricePaid=$${pricePaid}, <50%) (query: "${itemName}")`);
      tooSmall.push({ result, price, asin: toStringOrNull(result.asin ?? result.product_id) });
      continue;
    }

    // Sanity check: if price is > 300% of what the user paid, it's likely a multi-pack or bulk
    if (pricePaid && price > pricePaid * 3.00) {
      console.log(`[amazon] [TOO-BIG] "${title}" @ $${price} (pricePaid=$${pricePaid}, >300%) (query: "${itemName}")`);
      tooBig.push({ result, price, asin: toStringOrNull(result.asin ?? result.product_id) });
      continue;
    }

    const brandOk = passesBrandCheck(title, brands);
    const special = isSpecialty(title, itemName);
    const label = !brandOk ? "BRAND-SKIP" : special ? "SPECIALTY" : "PASS";
    console.log(`[amazon] [${label}] "${title}" @ $${price} (query: "${itemName}")`);

    const asin = toStringOrNull(result.asin ?? result.product_id);
    if (!brandOk)     noBrand.push({ result, price, asin });
    else if (special) specialty.push({ result, price, asin });
    else              standard.push({ result, price, asin });
  }

  // Pick: standard → specialty → noBrand → tooBig → tooSmall → first priced fallback
  const pool = standard.length > 0 ? standard
    : specialty.length > 0 ? specialty
    : noBrand.length > 0 ? noBrand
    : tooBig.length > 0 ? tooBig
    : tooSmall;
  let regularCandidate: Candidate | null = pool.length > 0
    ? pool.reduce((a, b) => (b.price < a.price ? b : a))
    : null;

  if (regularCandidate === null) {
    for (const result of results) {
      const price = parsePrice(result.price);
      if (price !== null) {
        regularCandidate = { result, price, asin: toStringOrNull(result.asin ?? result.product_id) };
        break;
      }
    }
  }

  if (regularCandidate === null) {
    console.error(`[amazon] No priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
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
  console.log(
    `[amazon] Selected "${itemName}": ${name} @ $${regularPrice}` +
    (bulkPrice !== null && bulkQuantity !== null
      ? `, bulk: $${bulkPrice} (${bulkQuantity} units, $${(bulkPrice / bulkQuantity).toFixed(2)}/unit)`
      : "") +
    ` (from ${standard.length} standard, ${specialty.length} specialty, ${noBrand.length} no-brand, ${tooBig.length} too-big, ${tooSmall.length} too-small)`
  );

  return {
    name,
    price: regularPrice,
    inStock: true,
    asin: regularAsin,
    regularPrice,
    bulkPrice,
    bulkQuantity,
    bulkAsin,
  };
}
