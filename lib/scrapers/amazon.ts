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

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "of", "in", "to", "is", "at", "by",
]);

const SPECIALTY_WORDS = [
  "whitening", "2-in-1", "organic", "premium", "professional",
  "advanced", "extra strength", "sensitive", "charcoal", "natural",
  "plus", "pro", "ultra", "clinical", "maximum", "complete",
];

function isRelevant(productName: string, query: string): boolean {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (keywords.length === 0) return true;
  const nameWords = new Set(productName.toLowerCase().split(/\W+/).filter(Boolean));
  const matchCount = keywords.filter((kw) => nameWords.has(kw)).length;
  return matchCount >= Math.max(1, Math.ceil(keywords.length / 2));
}

function isSpecialty(productName: string, query: string): boolean {
  const queryLower = query.toLowerCase();
  const nameLower = productName.toLowerCase();
  return SPECIALTY_WORDS.some((w) => nameLower.includes(w) && !queryLower.includes(w));
}

export async function scrapeAmazonPrice(itemName: string): Promise<AmazonResult | null> {
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

  type Candidate = { result: Record<string, unknown>; price: number; asin: string | null };
  const standard: Candidate[] = [];
  const specialty: Candidate[] = [];

  for (const result of results) {
    const price = parsePrice(result.price);
    const title = String(result.name ?? result.title ?? "");

    // Bulk listings are handled in a separate pass below
    if (BULK_RE.test(title)) continue;

    const relevant = isRelevant(title, itemName);
    const special = relevant && price !== null ? isSpecialty(title, itemName) : false;
    const label = !relevant ? "FAIL" : special ? "SPECIALTY" : "PASS";
    console.log(`[amazon] [${label}] "${title}" @ ${price !== null ? `$${price}` : "no price"} (query: "${itemName}")`);

    if (price === null || !relevant) continue;
    const asin = toStringOrNull(result.asin ?? result.product_id);
    if (special) specialty.push({ result, price, asin });
    else standard.push({ result, price, asin });
  }

  // Cheapest standard result wins; fall back to cheapest specialty
  const pool = standard.length > 0 ? standard : specialty;
  let regularCandidate: Candidate | null = pool.length > 0
    ? pool.reduce((a, b) => (b.price < a.price ? b : a))
    : null;

  // Last resort: first priced result regardless of relevance or bulk label
  if (regularCandidate === null) {
    for (const result of results) {
      const price = parsePrice(result.price);
      if (price !== null) {
        regularCandidate = {
          result,
          price,
          asin: toStringOrNull(result.asin ?? result.product_id),
        };
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
    ` (from ${standard.length} standard, ${specialty.length} specialty)`
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
