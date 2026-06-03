import {
  isRelevant,
  isSpecialty,
  extractBrands,
  passesBrandCheck,
  passesNegativeKeywords,
  getCategoryMinPrice,
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

export async function scrapeWalmartPrice(itemName: string, pricePaid?: number): Promise<WalmartResult | null> {
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
  const categoryMin = getCategoryMinPrice(itemName);

  type Candidate = { name: string; price: number; url: string | null };
  const standard: Candidate[] = [];
  const specialty: Candidate[] = [];
  const noBrand: Candidate[] = [];
  const tooBig: Candidate[] = [];
  const tooSmall: Candidate[] = [];

  for (const result of results) {
    const name = String(result.name ?? result.title ?? itemName);
    // Log all price fields so we can identify which one ScraperAPI populates
    if (result.price !== undefined || result.sale_price !== undefined || result.primary_price !== undefined || result.unit_price !== undefined) {
      console.log(`[walmart] price fields for "${name}": price=${result.price ?? "—"} sale_price=${result.sale_price ?? "—"} primary_price=${result.primary_price ?? "—"} unit_price=${result.unit_price ?? "—"}`);
    }
    // Prefer primary_price (shelf price) over price (may be unit/per-item price on some results)
    const price = parsePrice(result.primary_price ?? result.price ?? result.sale_price);
    const resultUrl = (typeof result.url === "string" && result.url) ? result.url
                    : (typeof result.link === "string" && result.link) ? result.link
                    : null;

    if (!isRelevant(name, itemName)) {
      console.log(`[walmart] [FAIL] "${name}" @ ${price !== null ? `$${price}` : "no price"} (query: "${itemName}")`);
      continue;
    }
    if (price === null) continue;

    if (!passesNegativeKeywords(name, itemName, "walmart")) continue;

    // Sanity check: if price is < 50% of what the user paid, it's likely a travel/mini size
    if (pricePaid && price < pricePaid * 0.50) {
      console.log(`[walmart] [TOO-SMALL] "${name}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooSmall.push({ name, price, url: resultUrl });
      continue;
    }

    // Category price floor: catches travel sizes even without pricePaid
    if (categoryMin !== null && price < categoryMin) {
      console.log(`[walmart] [TOO-SMALL] "${name}" @ $${price} (category floor $${categoryMin}) (query: "${itemName}")`);
      tooSmall.push({ name, price, url: resultUrl });
      continue;
    }

    // Sanity check: if price is > 200% of what the user paid, it's likely a multi-pack or bulk
    if (pricePaid && price > pricePaid * 2.00) {
      console.log(`[walmart] [TOO-BIG] "${name}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooBig.push({ name, price, url: resultUrl });
      continue;
    }

    const brandOk = passesBrandCheck(name, brands);
    const special = isSpecialty(name, itemName);
    const label = !brandOk ? "BRAND-SKIP" : special ? "SPECIALTY" : "PASS";
    console.log(`[walmart] [${label}] "${name}" @ $${price} (query: "${itemName}")`);

    if (!brandOk)     noBrand.push({ name, price, url: resultUrl });
    else if (special) specialty.push({ name, price, url: resultUrl });
    else              standard.push({ name, price, url: resultUrl });
  }

  // Pick cheapest: standard → specialty → noBrand → tooBig → tooSmall
  const pool = standard.length > 0 ? standard
    : specialty.length > 0 ? specialty
    : noBrand.length > 0 ? noBrand
    : tooBig.length > 0 ? tooBig
    : tooSmall;
  if (pool.length === 0) {
    console.error(`[walmart] No relevant priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
    return null;
  }

  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  console.log(`[walmart] Selected: "${best.name}" @ $${best.price} (from ${standard.length} standard, ${specialty.length} specialty, ${noBrand.length} no-brand, ${tooBig.length} too-big, ${tooSmall.length} too-small)`);
  return { name: best.name, price: best.price, inStock: true, url: best.url };
}
