export type SamsClubResult = {
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

export async function scrapeSamsClubPrice(itemName: string): Promise<SamsClubResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY ?? "";
  const targetUrl = `https://www.samsclub.com/search?searchTerm=${encodeURIComponent(itemName)}`;
  const scraperUrl =
    `http://api.scraperapi.com?api_key=${apiKey}` +
    `&url=${encodeURIComponent(targetUrl)}&render=true&premium=true&country_code=us`;

  let response: Response;
  try {
    response = await fetch(scraperUrl);
  } catch (err) {
    console.error(`[samsclub] Network error for "${itemName}":`, err);
    return null;
  }

  console.log(`[samsclub] Status: ${response.status} for "${itemName}"`);
  if (!response.ok) {
    console.error(`[samsclub] Error: ${response.status} ${response.statusText}`);
    return null;
  }

  const html = await response.text();
  console.log(`[samsclub] Preview: ${html.slice(0, 500)}`);

  // 1. __NEXT_DATA__ — Sam's Club is a Next.js/React app
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const json = JSON.parse(nextMatch[1]) as Record<string, unknown>;
      const result = walkForProduct(json);
      if (result) {
        console.log(`[samsclub] __NEXT_DATA__ match for "${itemName}": ${result.name} @ $${result.price}`);
        return { ...result, inStock: true };
      }
    } catch {}
  }

  // 2. JSON-LD
  const ldMatches = html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const match of ldMatches) {
    try {
      const data = JSON.parse(match[1]) as Record<string, unknown>;
      const entries = Array.isArray(data) ? data : [data];
      for (const entry of entries) {
        const e = entry as Record<string, unknown>;
        if (e["@type"] !== "Product") continue;
        const price = parsePrice(
          (e.offers as Record<string, unknown>)?.price ??
          (e.offers as Record<string, unknown>)?.lowPrice
        );
        if (price !== null) {
          console.log(`[samsclub] JSON-LD match for "${itemName}": ${e.name} @ $${price}`);
          return { name: (e.name as string) ?? itemName, price, inStock: true };
        }
      }
    } catch {}
  }

  // 3. data-testid / aria attributes Sam's Club uses for prices
  const testIdMatch = html.match(/data-testid=["'](?:itemPrice|price|sc-price)[^"']*["'][^>]*>\s*\$?([\d,]+\.?\d*)/i);
  if (testIdMatch) {
    const price = parsePrice(testIdMatch[1].replace(/,/g, ""));
    if (price !== null) {
      console.log(`[samsclub] data-testid match for "${itemName}": $${price}`);
      return { name: itemName, price, inStock: true };
    }
  }

  // 4. Regex — dollar amounts in the rendered HTML
  const priceMatches = [...html.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
  for (const m of priceMatches) {
    const price = parseFloat(m[1].replace(/,/g, ""));
    if (price >= 1 && price < 5000) {
      console.log(`[samsclub] Regex match for "${itemName}": $${price}`);
      return { name: itemName, price, inStock: true };
    }
  }

  console.error(
    `[samsclub] All parsers failed for "${itemName}". HTML (first 2000 chars):\n${html.slice(0, 2000)}`
  );
  return null;
}

function walkForProduct(
  node: unknown,
  depth = 0
): { name: string; price: number } | null {
  if (depth > 8 || node === null || typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;
  const price = parsePrice(
    obj.price ?? obj.salePrice ?? obj.finalPrice ?? obj.offerPrice ?? obj.unitPrice
  );
  const name = (obj.name ?? obj.title ?? obj.displayName ?? obj.productName) as string ?? "";
  if (price !== null && name.length > 2) return { name, price };

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkForProduct(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const val of Object.values(obj)) {
    const found = walkForProduct(val, depth + 1);
    if (found) return found;
  }

  return null;
}
