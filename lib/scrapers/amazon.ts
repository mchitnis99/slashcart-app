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

export async function scrapeAmazonPrice(itemName: string): Promise<AmazonResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY;
  const targetUrl = `https://www.amazon.com/s?k=${encodeURIComponent(itemName)}&i=grocery`;
  const scraperUrl =
    `http://api.scraperapi.com?api_key=${apiKey}` +
    `&url=${encodeURIComponent(targetUrl)}&render=true`;

  try {
    const response = await fetch(scraperUrl);
    console.log(`[amazon] Status: ${response.status} for "${itemName}"`);
    if (!response.ok) {
      console.error(`[amazon] Error: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    console.log(`[amazon] Preview: ${html.slice(0, 500)}`);

    // 1. JSON-LD — Amazon often includes structured product data
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
            if (price !== null) return { name: item.name ?? itemName, price, inStock: true };
          }
        }
      } catch {}
    }

    // 2. Embedded window data — Amazon inlines search results as JSON in script tags
    const dataScriptMatch = html.match(/data\s*:\s*(\{[^<]{50,})/);
    if (dataScriptMatch) {
      try {
        const json = JSON.parse(dataScriptMatch[1]);
        const result = walkForAmazonProduct(json);
        if (result) return { ...result, inStock: true };
      } catch {}
    }

    // 3. Regex — price appears as "$X.XX" in rendered HTML
    // Skip obviously wrong matches like "$0.00" or very high amounts
    const priceMatches = [...html.matchAll(/\$(\d{1,3}\.\d{2})/g)];
    for (const m of priceMatches) {
      const price = parseFloat(m[1]);
      if (price > 0.5 && price < 500) return { name: itemName, price, inStock: true };
    }

    return null;
  } catch (err) {
    console.error(`[amazon] Unexpected error for "${itemName}":`, err);
    return null;
  }
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
