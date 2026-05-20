export type CostcoResult = {
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

export async function scrapeCostcoPrice(itemName: string): Promise<CostcoResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY ?? "";
  const targetUrl = `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(itemName)}`;
  const scraperUrl =
    `http://api.scraperapi.com?api_key=${apiKey}` +
    `&url=${encodeURIComponent(targetUrl)}&render=true&country_code=us`;

  let response: Response;
  try {
    response = await fetch(scraperUrl);
  } catch (err) {
    console.error(`[costco] Network error for "${itemName}":`, err);
    return null;
  }

  console.log(`[costco] Status: ${response.status} for "${itemName}"`);
  if (!response.ok) {
    console.error(`[costco] Error: ${response.status} ${response.statusText}`);
    return null;
  }

  const html = await response.text();
  console.log(`[costco] Preview: ${html.slice(0, 500)}`);

  // 1. automation-id attribute (Costco's React component marker)
  // Matches: automation-id="catalog-item-price">$17.99 or similar
  const automationMatch = html.match(
    /automation-id=["']catalog-item-price["'][^>]*>\s*\$?([\d,]+\.?\d*)/i
  );
  if (automationMatch) {
    const price = parsePrice(automationMatch[1].replace(/,/g, ""));
    if (price !== null) {
      const nameMatch = html.match(
        /automation-id=["']catalog-item-title["'][^>]*>([^<]{3,100})</i
      );
      const name = nameMatch ? nameMatch[1].trim() : itemName;
      console.log(`[costco] automation-id match for "${itemName}": ${name} @ $${price}`);
      return { name, price, inStock: true };
    }
  }

  // 2. __NEXT_DATA__ — Costco may embed product data in Next.js page props
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const json = JSON.parse(nextMatch[1]) as Record<string, unknown>;
      const result = walkForCostcoProduct(json);
      if (result) {
        console.log(`[costco] __NEXT_DATA__ match for "${itemName}": ${result.name} @ $${result.price}`);
        return { ...result, inStock: true };
      }
    } catch {}
  }

  // 3. JSON-LD structured data
  const ldMatches = html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const match of ldMatches) {
    try {
      const data = JSON.parse(match[1]) as Record<string, unknown>;
      const entries = Array.isArray(data) ? data : [data];
      for (const entry of entries) {
        if ((entry as Record<string, unknown>)["@type"] !== "Product") continue;
        const e = entry as Record<string, unknown>;
        const price = parsePrice(
          (e.offers as Record<string, unknown>)?.price ??
          (e.offers as Record<string, unknown>)?.lowPrice
        );
        if (price !== null) {
          console.log(`[costco] JSON-LD match for "${itemName}": ${e.name} @ $${price}`);
          return { name: e.name as string ?? itemName, price, inStock: true };
        }
      }
    } catch {}
  }

  // 4. Regex — dollar amounts in the rendered HTML, skip implausibly low/high values
  const priceMatches = [...html.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
  for (const m of priceMatches) {
    const price = parseFloat(m[1].replace(/,/g, ""));
    if (price >= 1 && price < 5000) {
      console.log(`[costco] Regex price match for "${itemName}": $${price}`);
      return { name: itemName, price, inStock: true };
    }
  }

  console.error(
    `[costco] All parsers failed for "${itemName}". HTML (first 2000 chars):\n${html.slice(0, 2000)}`
  );
  return null;
}

function walkForCostcoProduct(
  node: unknown,
  depth = 0
): { name: string; price: number } | null {
  if (depth > 8 || node === null || typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;

  const price = parsePrice(
    obj.price ?? obj.salePrice ?? obj.finalPrice ?? obj.offerPrice
  );
  const name = (obj.name ?? obj.title ?? obj.displayName ?? obj.productName) as string ?? "";
  if (price !== null && name.length > 2) return { name, price };

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkForCostcoProduct(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const val of Object.values(obj)) {
    const found = walkForCostcoProduct(val, depth + 1);
    if (found) return found;
  }

  return null;
}
