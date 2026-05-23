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

function searchKeywords(itemName: string): string[] {
  return itemName.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
}

function relevanceScore(title: string, keywords: string[]): number {
  const lower = title.toLowerCase();
  let score = 0;
  keywords.forEach((kw, i) => {
    if (lower.includes(kw)) {
      // First keyword is treated as the brand — weight it 3x
      score += i === 0 ? 3 : 1;
    }
  });
  return score;
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
  console.log(`[amazon] First 3 results for "${itemName}":`, JSON.stringify(results.slice(0, 3), null, 2));

  const keywords = searchKeywords(itemName);

  // Pick the best-matching non-bulk priced result by keyword relevance.
  // Among equal scores, earlier results (Amazon's own ranking) win.
  let regularResult: Record<string, unknown> | null = null;
  let regularPrice: number | null = null;
  let regularAsin: string | null = null;
  let bestScore = -1;

  for (const result of results) {
    const price = parsePrice(result.price);
    if (price === null) continue;
    const title = String(result.name ?? result.title ?? "");
    if (BULK_RE.test(title)) continue;
    const score = relevanceScore(title, keywords);
    if (score > bestScore) {
      bestScore = score;
      regularResult = result;
      regularPrice = price;
      regularAsin = toStringOrNull(result.asin ?? result.product_id);
    }
  }

  // Fall back to first priced result if all results are bulk-labelled
  if (regularPrice === null) {
    for (const result of results) {
      const price = parsePrice(result.price);
      if (price !== null) {
        regularResult = result;
        regularPrice = price;
        regularAsin = toStringOrNull(result.asin ?? result.product_id);
        break;
      }
    }
  }

  if (regularPrice === null || regularResult === null) {
    console.error(`[amazon] No priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
    return null;
  }

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
    `[amazon] Result for "${itemName}": ${name} @ $${regularPrice}` +
    (bulkPrice !== null && bulkQuantity !== null
      ? `, bulk: $${bulkPrice} (${bulkQuantity} units, $${(bulkPrice / bulkQuantity).toFixed(2)}/unit)`
      : "")
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
