import {
  isRelevant,
  isSpecialty,
  extractBrands,
  passesBrandCheck,
  passesNegativeKeywords,
} from "@/lib/scrapers/filters";

export type WalmartResult = {
  name: string;
  price: number;
  inStock: boolean;
  url: string | null;
};

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

  const brands = extractBrands(itemName);

  type Candidate = { name: string; price: number; url: string | null };
  const standard: Candidate[] = [];
  const specialty: Candidate[] = [];
  const noBrand: Candidate[] = [];

  for (const result of results) {
    const price = parsePrice(result.price ?? result.sale_price ?? result.primary_price);
    const name = String(result.name ?? result.title ?? itemName);
    const resultUrl = (typeof result.url === "string" && result.url) ? result.url
                    : (typeof result.link === "string" && result.link) ? result.link
                    : null;

    if (!isRelevant(name, itemName)) {
      console.log(`[walmart] [FAIL] "${name}" @ ${price !== null ? `$${price}` : "no price"} (query: "${itemName}")`);
      continue;
    }
    if (price === null) continue;

    if (!passesNegativeKeywords(name, itemName, "walmart")) continue;

    const brandOk = passesBrandCheck(name, brands);
    const special = isSpecialty(name, itemName);
    const label = !brandOk ? "BRAND-SKIP" : special ? "SPECIALTY" : "PASS";
    console.log(`[walmart] [${label}] "${name}" @ $${price} (query: "${itemName}")`);

    if (!brandOk)     noBrand.push({ name, price, url: resultUrl });
    else if (special) specialty.push({ name, price, url: resultUrl });
    else              standard.push({ name, price, url: resultUrl });
  }

  // Pick cheapest: standard → specialty → noBrand
  const pool = standard.length > 0 ? standard : specialty.length > 0 ? specialty : noBrand;
  if (pool.length === 0) {
    console.error(`[walmart] No relevant priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
    return null;
  }

  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  console.log(`[walmart] Selected: "${best.name}" @ $${best.price} (from ${standard.length} standard, ${specialty.length} specialty, ${noBrand.length} no-brand)`);
  return { name: best.name, price: best.price, inStock: true, url: best.url };
}
