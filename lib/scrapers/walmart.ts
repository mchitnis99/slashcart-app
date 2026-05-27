export type WalmartResult = {
  name: string;
  price: number;
  inStock: boolean;
};

const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "for", "with", "of", "in", "to", "is", "at", "by"]);

function isRelevant(productName: string, query: string): boolean {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (keywords.length === 0) return true;
  // Whole-word matching — "flour" in "Pizza Flour" is not enough if "purpose" is also a keyword
  const nameWords = new Set(productName.toLowerCase().split(/\W+/).filter(Boolean));
  const matchCount = keywords.filter((kw) => nameWords.has(kw)).length;
  // Require at least half the keywords to match (minimum 1), whole-word only
  return matchCount >= Math.max(1, Math.ceil(keywords.length / 2));
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 && raw < 10000 ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return !isNaN(n) && n > 0 && n < 10000 ? n : null;
  }
  return null;
}

export async function scrapeWalmartPrice(itemName: string): Promise<WalmartResult | null> {
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

  console.log(`[walmart] Got ${results.length} results for "${itemName}"`);

  for (const result of results) {
    const price = parsePrice(result.price ?? result.sale_price ?? result.primary_price);
    const name = String(result.name ?? result.title ?? itemName);
    const relevant = isRelevant(name, itemName);
    console.log(`[walmart] [${relevant ? "PASS" : "FAIL"}] "${name}" @ ${price !== null ? `$${price}` : "no price"} (query: "${itemName}")`);
    if (price === null || !relevant) continue;
    return { name, price, inStock: true };
  }

  console.error(`[walmart] No relevant priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
  return null;
}
