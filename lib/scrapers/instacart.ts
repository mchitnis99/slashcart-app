export type InstacartStoreResult = {
  store: string;
  price: number;
  productName: string;
};

const SHOP_ID_MAP: Record<string, { name: string }> = {
  "75":     { name: "Whole Foods"  },
  "9501":   { name: "Walmart"      },
  "12":     { name: "Costco"       },
  "521051": { name: "Aldi"         },
  "399004": { name: "Stop & Shop"  },
  "514691": { name: "Target"       },
  "483360": { name: "CVS"          },
};

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return isNaN(n) || n <= 0 ? null : n;
  }
  return null;
}

// Walk the full JSON tree collecting one priced product per known store.
function walkForSearchResults(
  node: unknown,
  byStore: Map<string, InstacartStoreResult> = new Map(),
  depth = 0
): Map<string, InstacartStoreResult> {
  if (depth > 10 || node === null || typeof node !== "object") return byStore;

  if (Array.isArray(node)) {
    for (const item of node) walkForSearchResults(item, byStore, depth + 1);
    return byStore;
  }

  const obj = node as Record<string, unknown>;

  const rawPrice =
    (obj.pricing as Record<string, unknown>)?.price ??
    obj.price ??
    (obj.pricing as Record<string, unknown>)?.display_price ??
    obj.display_price;

  const price = parsePrice(rawPrice);

  if (price !== null) {
    // Resolve store name from shopId first, then from embedded retailer name
    const shopId =
      obj.shopId ??
      (obj.retailer as Record<string, unknown>)?.shopId ??
      (obj.store as Record<string, unknown>)?.shopId ??
      (obj.retailerInfo as Record<string, unknown>)?.shopId;

    let storeName: string | undefined;

    if (shopId !== undefined) {
      storeName = SHOP_ID_MAP[String(shopId)]?.name;
    }

    if (!storeName) {
      const retailerName =
        (obj.retailer as Record<string, unknown>)?.name as string ??
        (obj.store as Record<string, unknown>)?.name as string ??
        obj.retailerName as string ??
        obj.storeName as string;
      if (retailerName) {
        storeName = Object.values(SHOP_ID_MAP).find((v) =>
          retailerName.toLowerCase().includes(v.name.toLowerCase()) ||
          v.name.toLowerCase().includes(retailerName.toLowerCase())
        )?.name;
      }
    }

    const productName =
      obj.name as string ??
      obj.title as string ??
      obj.productName as string ??
      "";

    if (storeName && productName && !byStore.has(storeName)) {
      byStore.set(storeName, { store: storeName, price, productName });
    }
  }

  for (const val of Object.values(obj)) walkForSearchResults(val, byStore, depth + 1);
  return byStore;
}

function extractResultsFromData(data: unknown): InstacartStoreResult[] {
  return [...walkForSearchResults(data).values()];
}

function extractResultsFromHtml(html: string): InstacartStoreResult[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    return extractResultsFromData(JSON.parse(match[1]));
  } catch {
    return [];
  }
}

export async function scrapeInstacartPrices(
  itemName: string,
  zipCode: string
): Promise<InstacartStoreResult[]> {
  void zipCode; // global search is location-inferred by Instacart; no zip param supported

  const apiKey = process.env.SCRAPERAPI_KEY;
  const searchApiUrl = `https://www.instacart.com/store/s?k=${encodeURIComponent(itemName)}`;
  const searchUrl =
    `http://api.scraperapi.com?api_key=${apiKey}` +
    `&url=${encodeURIComponent(searchApiUrl)}&render=true`;

  console.log(`[instacart] Global search: ${searchApiUrl}`);

  let res: Response;
  try {
    res = await fetch(searchUrl);
  } catch (err) {
    console.error(`[instacart] Network error:`, err);
    return [];
  }

  console.log(`[instacart] Status: ${res.status} for "${itemName}"`);
  if (!res.ok) {
    console.error(`[instacart] Failed: ${res.status} ${res.statusText}`);
    return [];
  }

  const body = await res.text();
  console.log(`[instacart] Response preview: ${body.slice(0, 500)}`);

  let results: InstacartStoreResult[];
  try {
    results = extractResultsFromData(JSON.parse(body));
  } catch {
    results = extractResultsFromHtml(body);
  }

  console.log(`[instacart] Found ${results.length} store results for "${itemName}":`, results);
  return results;
}
