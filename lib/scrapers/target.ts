export type TargetResult = {
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

function walkForProduct(
  node: unknown,
  depth = 0
): { name: string; price: number } | null {
  if (depth > 8 || node === null || typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;

  // Heuristic: object has a price-like field and a name-like field
  const rawPrice =
    (obj.price as Record<string, unknown>)?.currentRetail ??
    (obj.price as Record<string, unknown>)?.formattedCurrentPrice ??
    (obj.price as Record<string, unknown>)?.current_retail ??
    obj.price ??
    obj.offerPrice ??
    obj.salePrice;

  const price = parsePrice(rawPrice);
  const name = obj.title as string ?? obj.name as string ?? obj.productTitle as string ?? "";

  if (price !== null && name) return { name, price };

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

export async function scrapeTargetPrice(itemName: string): Promise<TargetResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY;
  const targetUrl = `https://www.target.com/s?searchTerm=${encodeURIComponent(itemName)}`;
  const scraperUrl =
    `http://api.scraperapi.com?api_key=${apiKey}` +
    `&url=${encodeURIComponent(targetUrl)}&render=true`;

  try {
    const response = await fetch(scraperUrl);
    console.log(`[target] Status: ${response.status} for "${itemName}"`);
    if (!response.ok) {
      console.error(`[target] Error: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    console.log(`[target] Preview: ${html.slice(0, 500)}`);

    // 1. __NEXT_DATA__ recursive walk
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const json = JSON.parse(nextDataMatch[1]);
        const product = walkForProduct(json);
        if (product) return { ...product, inStock: true };
      } catch {}
    }

    // 2. JSON-LD
    const ldMatches = html.matchAll(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
    );
    for (const match of ldMatches) {
      try {
        const data = JSON.parse(match[1]);
        const entries = data["@type"] === "ItemList" ? (data.itemListElement ?? []) : [data];
        for (const entry of entries) {
          const item = entry.item ?? entry;
          const price = parsePrice(item?.offers?.price ?? item?.offers?.lowPrice);
          if (price !== null) return { name: item.name ?? itemName, price, inStock: true };
        }
      } catch {}
    }

    // 3. Regex last resort
    const match = html.match(/\$(\d+\.\d{2})/);
    if (match) {
      const price = parseFloat(match[1]);
      if (price > 0) return { name: itemName, price, inStock: true };
    }

    return null;
  } catch (err) {
    console.error(`[target] Unexpected error for "${itemName}":`, err);
    return null;
  }
}
