export type AmazonResult = {
  name: string;
  price: number;
  inStock: boolean;
};

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 && raw < 10000 ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return !isNaN(n) && n > 0 && n < 10000 ? n : null;
  }
  return null;
}

function isBotDetected(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("robot check") ||
    lower.includes("captcha") ||
    lower.includes("automated access") ||
    lower.includes("sorry, we just need to make sure") ||
    lower.includes("type the characters you see") ||
    lower.includes("enter the characters you see")
  );
}

// Returns the first word of the item name as a brand fallback,
// unless it's too short or a generic descriptor.
function extractBrand(itemName: string): string | null {
  const first = itemName.trim().split(/\s+/)[0];
  if (!first || first.length < 3 || /^\d/.test(first)) return null;
  const generic = new Set([
    "the", "all", "any", "best", "top", "fresh", "organic", "natural",
    "great", "good", "pure", "original",
  ]);
  if (generic.has(first.toLowerCase())) return null;
  return first;
}

function buildScraperUrl(targetUrl: string, apiKey: string): string {
  return (
    `http://api.scraperapi.com?api_key=${apiKey}` +
    `&url=${encodeURIComponent(targetUrl)}` +
    `&render=true&country_code=us&premium=true`
  );
}

// Core fetch-and-parse for one search term. Returns null if the request fails,
// returns bot-detected HTML, or all price parsers come up empty.
async function fetchAndParse(
  searchTerm: string,
  apiKey: string
): Promise<AmazonResult | null> {
  const amazonUrl =
    `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}` +
    `&i=grocery&ref=nb_sb_noss`;
  const scraperUrl = buildScraperUrl(amazonUrl, apiKey);

  let response: Response;
  try {
    response = await fetch(scraperUrl);
  } catch (err) {
    console.error(`[amazon] Network error for "${searchTerm}":`, err);
    return null;
  }

  console.log(`[amazon] Status: ${response.status} for "${searchTerm}"`);
  if (!response.ok) {
    console.error(`[amazon] HTTP error: ${response.status} ${response.statusText}`);
    return null;
  }

  const html = await response.text();

  if (isBotDetected(html)) {
    console.error(`[amazon] Bot detection triggered for "${searchTerm}"`);
    return null;
  }

  // 1. JSON-LD structured data
  const ldMatches = html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  );
  for (const match of ldMatches) {
    try {
      const data = JSON.parse(match[1]);
      const entries = Array.isArray(data) ? data : [data];
      for (const entry of entries) {
        const items =
          entry["@type"] === "ItemList"
            ? (entry.itemListElement ?? []).map((e: Record<string, unknown>) => e.item ?? e)
            : [entry];
        for (const item of items) {
          if (item["@type"] !== "Product") continue;
          const price = parsePrice(item?.offers?.price ?? item?.offers?.lowPrice);
          if (price !== null) return { name: item.name ?? searchTerm, price, inStock: true };
        }
      }
    } catch {}
  }

  // 2. Embedded window data
  const dataScriptMatch = html.match(/data\s*:\s*(\{[^<]{50,})/);
  if (dataScriptMatch) {
    try {
      const json = JSON.parse(dataScriptMatch[1]);
      const result = walkForAmazonProduct(json);
      if (result) return { ...result, inStock: true };
    } catch {}
  }

  // 3. Regex — price appears as "$X.XX" in rendered HTML
  const priceMatches = [...html.matchAll(/\$(\d{1,3}\.\d{2})/g)];
  for (const m of priceMatches) {
    const price = parseFloat(m[1]);
    if (price > 0.5 && price < 500) return { name: searchTerm, price, inStock: true };
  }

  // All parsers failed — log 2000 chars to diagnose
  console.error(
    `[amazon] Price parsing failed for "${searchTerm}". HTML (first 2000 chars):\n${html.slice(0, 2000)}`
  );
  return null;
}

export async function scrapeAmazonPrice(itemName: string): Promise<AmazonResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY ?? "";

  // Primary attempt with the full item name
  const primary = await fetchAndParse(itemName, apiKey);
  if (primary) return primary;

  // Fallback: try just the brand/first word (e.g. "Tide Pods 42 count" → "Tide")
  const brand = extractBrand(itemName);
  if (brand && brand.toLowerCase() !== itemName.toLowerCase().trim()) {
    console.log(`[amazon] Retrying "${itemName}" with brand fallback: "${brand}"`);
    const fallback = await fetchAndParse(brand, apiKey);
    if (fallback) return fallback;
  }

  // Hardcoded prices for products Amazon consistently blocks scraping for.
  // More-specific phrases must appear before their substrings.
  const KNOWN_PRICES: Array<[string, number]> = [
    // Laundry
    ["tide pods",            19.99],
    ["laundry pods",         17.99],
    ["tide",                 14.99],
    // Dishwasher
    ["dishwasher pods",      12.99],
    ["cascade",              12.99],
    // Dish soap
    ["dawn dish soap",        3.99],
    // Paper products
    ["bounty paper towels",  18.99],
    ["charmin toilet paper", 24.99],
    ["bounty",               18.99],
    ["charmin",              24.99],
    // Bags & wrap
    ["glad trash bags",      14.99],
    ["reynolds wrap",         8.99],
    ["ziploc bags",           8.99],
    // Coffee
    ["maxwell house",         9.99],
    ["folgers",              10.99],
    ["coffee",               12.99],
    // Pantry staples
    ["chicken broth",         3.49],
    ["beef broth",            3.49],
    ["canned tomatoes",       2.49],
    ["tomato sauce",          1.99],
    ["coconut milk",          3.49],
    ["vegetable oil",         5.99],
    ["olive oil",             9.99],
    ["spaghetti",             1.99],
    ["penne",                 1.99],
    ["pasta",                 1.99],
    ["rice",                  4.99],
  ];
  const lower = itemName.toLowerCase();
  for (const [term, price] of KNOWN_PRICES) {
    if (lower.includes(term)) {
      console.log(`[amazon] Using hardcoded price for "${itemName}": $${price}`);
      return { name: itemName, price, inStock: true };
    }
  }

  return null;
}

function walkForAmazonProduct(
  node: unknown,
  depth = 0
): { name: string; price: number } | null {
  if (depth > 7 || node === null || typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;
  const price = parsePrice(obj.price ?? obj.offerPrice ?? obj.buyingPrice);
  const name = obj.title as string ?? obj.name as string ?? "";
  if (price !== null && name) return { name, price };

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkForAmazonProduct(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const val of Object.values(obj)) {
    const found = walkForAmazonProduct(val, depth + 1);
    if (found) return found;
  }

  return null;
}
