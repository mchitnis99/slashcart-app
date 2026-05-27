export type WalmartResult = {
  name: string;
  price: number;
  inStock: boolean;
};

const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "for", "with", "of", "in", "to", "is", "at", "by"]);

const SPECIALTY_WORDS = ["organic", "gluten-free", "gluten free", "blend", "alternative", "vegan", "keto", "paleo", "non-gmo", "plant-based"];

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

  // Collect all relevant, priced candidates
  const standard: { name: string; price: number }[] = [];
  const specialty: { name: string; price: number }[] = [];

  for (const result of results) {
    const price = parsePrice(result.price ?? result.sale_price ?? result.primary_price);
    const name = String(result.name ?? result.title ?? itemName);
    const relevant = isRelevant(name, itemName);
    const special = relevant && price !== null ? isSpecialty(name, itemName) : false;
    console.log(`[walmart] [${relevant ? (special ? "SPECIALTY" : "PASS") : "FAIL"}] "${name}" @ ${price !== null ? `$${price}` : "no price"} (query: "${itemName}")`);
    if (price === null || !relevant) continue;
    if (special) specialty.push({ name, price });
    else standard.push({ name, price });
  }

  // Pick cheapest standard result; fall back to cheapest specialty if no standard results
  const pool = standard.length > 0 ? standard : specialty;
  if (pool.length === 0) {
    console.error(`[walmart] No relevant priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
    return null;
  }

  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  console.log(`[walmart] Selected: "${best.name}" @ $${best.price} (from ${standard.length} standard, ${specialty.length} specialty)`);
  return { name: best.name, price: best.price, inStock: true };
}
