export type InstacartStoreResult = {
  store: string;
  price: number;
  productName: string;
};

type RawStore = {
  name?: string;
  retailer_name?: string;
  slug?: string;
  id?: string | number;
};

type RawProduct = {
  name?: string;
  title?: string;
  pricing?: { price?: number; display_price?: string };
  price?: number | string;
  display_price?: string;
};

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return isNaN(n) || n <= 0 ? null : n;
  }
  return null;
}

function extractProductFromJson(json: unknown): { name: string; price: number } | null {
  const j = json as Record<string, unknown>;
  const products: RawProduct[] =
    (j?.data as Record<string, unknown>)?.products as RawProduct[] ??
    (j?.data as Record<string, unknown>)?.items as RawProduct[] ??
    (j?.products as RawProduct[]) ??
    (j?.items as RawProduct[]) ??
    [];

  if (!Array.isArray(products)) return null;

  for (const p of products) {
    const raw =
      p?.pricing?.price ??
      p?.price ??
      p?.display_price ??
      p?.pricing?.display_price;
    const price = parsePrice(raw);
    if (price !== null) {
      return { name: p?.name ?? p?.title ?? "", price };
    }
  }
  return null;
}

function extractProductFromHtml(html: string): { name: string; price: number } | null {
  // Instacart is a Next.js app — product data lives in __NEXT_DATA__
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const json = JSON.parse(match[1]) as Record<string, unknown>;
    // Walk known paths where Instacart embeds search results
    const pageProps = (json?.props as Record<string, unknown>)?.pageProps as Record<string, unknown>;
    const candidates = [
      pageProps?.searchResults,
      pageProps?.initialState,
      pageProps?.initialData,
    ];

    for (const node of candidates) {
      const result = extractProductFromJson(node);
      if (result) return result;
    }

    // Broader walk: any array named "products" or "items" anywhere in pageProps
    const found = walkForProducts(pageProps);
    if (found) return found;
  } catch {}

  return null;
}

function walkForProducts(node: unknown, depth = 0): { name: string; price: number } | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;

  for (const key of ["products", "items", "searchResults", "results"]) {
    if (Array.isArray(obj[key])) {
      const result = extractProductFromJson({ products: obj[key] });
      if (result) return result;
    }
  }

  for (const val of Object.values(obj)) {
    const result = walkForProducts(val, depth + 1);
    if (result) return result;
  }

  return null;
}

function extractStoresFromJson(body: string): RawStore[] {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const raw =
      (json?.data as Record<string, unknown>)?.stores ??
      (json?.data as Record<string, unknown>)?.available_stores ??
      (json?.data as Record<string, unknown>)?.retailers ??
      json?.stores ??
      json?.retailers ??
      json?.data;
    return Array.isArray(raw) ? (raw as RawStore[]) : [];
  } catch {
    return [];
  }
}

// Recursively collect every object that has a shopId field.
// Uses a Map keyed by shopId to deduplicate.
function walkForShopIds(
  node: unknown,
  found: Map<string, RawStore> = new Map(),
  depth = 0
): Map<string, RawStore> {
  if (depth > 8 || node === null || typeof node !== "object") return found;

  if (Array.isArray(node)) {
    for (const item of node) walkForShopIds(item, found, depth + 1);
    return found;
  }

  const obj = node as Record<string, unknown>;
  if (obj.shopId !== undefined) {
    const shopId = String(obj.shopId);
    if (!found.has(shopId)) {
      const name =
        (obj.name as string) ??
        (obj.storeName as string) ??
        (obj.retailerName as string) ??
        (obj.displayName as string) ??
        (obj.retailer_name as string);
      // Prefer explicit slug fields; fall back to shopId which Instacart often
      // accepts as a URL segment (e.g. /store/123/storefront_search)
      const slug =
        (obj.slug as string) ??
        (obj.urlSlug as string) ??
        (obj.url_slug as string) ??
        (obj.storeSlug as string) ??
        (obj.handle as string) ??
        shopId;
      found.set(shopId, { name, slug, id: shopId });
    }
  }

  for (const val of Object.values(obj)) walkForShopIds(val, found, depth + 1);
  return found;
}

function decodeAndExtractStores(content: string, source: string): RawStore[] {
  let decoded: string;
  try {
    decoded = decodeURIComponent(content.trim());
  } catch {
    return [];
  }

  let json: unknown;
  try {
    json = JSON.parse(decoded);
  } catch {
    // Strip leading variable assignment or trailing semicolons e.g. "window.__state={...};"
    const stripped = decoded.replace(/^[^{[]*/, "").replace(/[^}\]]*$/, "");
    try {
      json = JSON.parse(stripped);
    } catch {
      return [];
    }
  }

  const stores = [...walkForShopIds(json).values()];
  if (stores.length > 0) {
    console.log(`[instacart] Decoded ${stores.length} stores from ${source}`);
  }
  return stores;
}

// Look for URL-encoded state blobs that contain shopId.
// URL-encoded content never contains literal "<", so [^<]+ is safe and fast.
function extractStoresFromNodeState(html: string): RawStore[] {
  // 1. Known script tag IDs Instacart has used
  for (const id of ["node-state", "redux-state", "initial-state", "app-state", "server-state"]) {
    const re = new RegExp(`<script[^>]*id="${id}"[^>]*>([^<]+)<\\/script>`);
    const m = html.match(re);
    if (m) {
      const stores = decodeAndExtractStores(m[1], `<script id="${id}">`);
      if (stores.length > 0) return stores;
    }
  }

  // 2. Any script whose raw content contains URL-encoded "shopId"
  const re = /<script[^>]*>([^<]*%22shopId%22[^<]*)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const stores = decodeAndExtractStores(m[1], "anonymous script with %22shopId%22");
    if (stores.length > 0) return stores;
  }

  return [];
}

function extractStoresFromHtml(html: string): RawStore[] {
  // Try URL-encoded node-state blobs first (newer Instacart pattern)
  const fromNodeState = extractStoresFromNodeState(html);
  if (fromNodeState.length > 0) return fromNodeState;

  // Fall back to __NEXT_DATA__ JSON
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const json = JSON.parse(match[1]) as Record<string, unknown>;
    const pageProps = (json?.props as Record<string, unknown>)?.pageProps as Record<string, unknown>;
    const candidates = [
      pageProps?.stores,
      pageProps?.retailers,
      pageProps?.availableStores,
      (pageProps?.initialState as Record<string, unknown>)?.stores,
      (pageProps?.initialData as Record<string, unknown>)?.stores,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c as RawStore[];
    }
    const found = walkForStores(pageProps);
    if (found.length > 0) return found;
  } catch {}
  return [];
}

function walkForStores(node: unknown, depth = 0): RawStore[] {
  if (depth > 5 || node === null || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  for (const key of ["stores", "retailers", "availableStores", "available_stores"]) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
      return obj[key] as RawStore[];
    }
  }
  for (const val of Object.values(obj)) {
    const found = walkForStores(val, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

async function fetchStoresForZip(zipCode: string, apiKey: string): Promise<RawStore[]> {
  const encoded = encodeURIComponent(zipCode);

  const endpoints: Array<{ label: string; url: string; render: boolean }> = [
    {
      label: "/api/v2/stores",
      url: `https://www.instacart.com/api/v2/stores?zip_code=${encoded}`,
      render: false,
    },
    {
      label: "/retailers",
      url: `https://www.instacart.com/retailers?zip_code=${encoded}`,
      render: false,
    },
    {
      label: "/ (homepage __NEXT_DATA__)",
      url: `https://www.instacart.com/?zip_code=${encoded}`,
      render: true,
    },
  ];

  for (const ep of endpoints) {
    const scraperUrl =
      `http://api.scraperapi.com?api_key=${apiKey}` +
      `&url=${encodeURIComponent(ep.url)}` +
      (ep.render ? "&render=true" : "");

    let res: Response;
    try {
      res = await fetch(scraperUrl);
    } catch (err) {
      console.error(`[instacart] Network error fetching ${ep.label}:`, err);
      continue;
    }

    console.log(`[instacart] ${ep.label} → status ${res.status} for zip ${zipCode}`);

    if (!res.ok) {
      console.error(`[instacart] ${ep.label} failed: ${res.status} ${res.statusText}`);
      continue;
    }

    const body = await res.text();
    console.log(`[instacart] ${ep.label} full response:\n${body}`);

    const stores = ep.render ? extractStoresFromHtml(body) : extractStoresFromJson(body);
    console.log(`[instacart] ${ep.label} parsed ${stores.length} stores`);
    if (stores.length > 0) return stores;
  }

  return [];
}

export async function scrapeInstacartPrices(
  itemName: string,
  zipCode: string
): Promise<InstacartStoreResult[]> {
  const apiKey = process.env.SCRAPERAPI_KEY;

  // Step 1: fetch stores available for this zip — try multiple endpoints
  let stores: RawStore[] = [];
  try {
    stores = await fetchStoresForZip(zipCode, apiKey ?? "");
    console.log(`[instacart] Total stores found for zip ${zipCode}: ${stores.length}`);
  } catch (err) {
    console.error(`[instacart] fetchStoresForZip threw:`, err);
  }

  if (stores.length === 0) return [];

  // Step 2: search each store for the item in parallel
  const results = await Promise.all(
    stores.map(async (store): Promise<InstacartStoreResult | null> => {
      const storeName = store.name ?? store.retailer_name ?? "Unknown";
      const storeSlug = store.slug ?? String(store.id ?? "");
      if (!storeSlug) return null;

      try {
        const searchApiUrl = `https://www.instacart.com/store/${storeSlug}/storefront_search?query=${encodeURIComponent(itemName)}`;
        const searchUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(searchApiUrl)}&render=true`;

        const searchRes = await fetch(searchUrl);
        console.log(`[instacart] Search status: ${searchRes.status} for "${itemName}" at ${storeName}`);
        if (!searchRes.ok) return null;

        const body = await searchRes.text();
        console.log(`[instacart] Search preview for ${storeName}: ${body.slice(0, 500)}`);

        // Try JSON first (in case this endpoint returns raw API data)
        let product: { name: string; price: number } | null = null;
        try {
          const json = JSON.parse(body);
          product = extractProductFromJson(json);
        } catch {
          // Rendered HTML — parse __NEXT_DATA__
          product = extractProductFromHtml(body);
        }

        if (!product) return null;

        return {
          store: storeName,
          price: product.price,
          productName: product.name || itemName,
        };
      } catch (err) {
        console.error(`[instacart] Error searching ${storeName}:`, err);
        return null;
      }
    })
  );

  return results.filter((r): r is InstacartStoreResult => r !== null);
}
