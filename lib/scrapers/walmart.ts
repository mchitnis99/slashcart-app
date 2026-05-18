export type WalmartResult = {
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

export async function scrapeWalmartPrice(itemName: string): Promise<WalmartResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY;
  const targetUrl = `https://www.walmart.com/search?q=${encodeURIComponent(itemName)}`;
  const scraperUrl =
    `http://api.scraperapi.com?api_key=${apiKey}` +
    `&url=${encodeURIComponent(targetUrl)}&render=true`;

  try {
    const response = await fetch(scraperUrl);
    console.log(`[walmart] Status: ${response.status} for "${itemName}"`);
    if (!response.ok) {
      console.error(`[walmart] Error: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    console.log(`[walmart] Preview: ${html.slice(0, 500)}`);

    // 1. __NEXT_DATA__ — Walmart embeds full product data here
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const json = JSON.parse(nextDataMatch[1]);
        const stacks =
          json?.props?.pageProps?.initialData?.searchResult?.itemStacks ??
          json?.props?.pageProps?.searchResult?.itemStacks ??
          [];
        for (const stack of stacks) {
          for (const item of stack?.items ?? []) {
            const raw =
              item?.price?.currentPrice?.price ??
              item?.priceInfo?.currentPrice?.price ??
              item?.price?.primary ??
              item?.primaryOffer?.offerPrice;
            const price = parsePrice(raw);
            if (price !== null) {
              return { name: item?.name ?? item?.title ?? itemName, price, inStock: true };
            }
          }
        }
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
    console.error(`[walmart] Unexpected error for "${itemName}":`, err);
    return null;
  }
}
