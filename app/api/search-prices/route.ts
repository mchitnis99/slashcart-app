export const maxDuration = 60;

import { getCachedPrice, setCachedPrice } from "@/lib/cache";
import { type ParsedUnit } from "@/lib/utils/parseUnit";
import { parseSize, toComparableSize } from "@/lib/utils/parseSize";

type GroceryItem = {
  name: string;
  quantity: number;
  unit: string;
};

type StoreResult = {
  price: number | null;
  productName: string;
};

// Raw scraped fields only — matches what's stored in the Supabase cache.
type AmazonRaw = {
  price: number | null;
  productName: string;
  asin: string | null;
  regularPrice: number | null;
  bulkPrice: number | null;
  bulkQuantity: number | null;
  bulkAsin: string | null;
};

// Enriched type returned to the client — includes derived annualSavings.
type AmazonStoreResult = AmazonRaw & {
  annualSavings: number | null;
};

type PricedItem = {
  name: string;
  quantity: number;
  unit: string;
  amazon: AmazonStoreResult;
  walmart: StoreResult;
  samsclub: StoreResult;
  sizeMismatch: boolean;
};


function checkSizeMismatch(a: ParsedUnit | null, b: ParsedUnit | null): boolean {
  const aSize = toComparableSize(a);
  const bSize = toComparableSize(b);
  if (!aSize || !bSize) return false;
  return aSize.unit !== bSize.unit; // only flag when unit types are incomparable
}

function computeAnnualSavings(raw: AmazonRaw): number | null {
  if (raw.regularPrice === null || raw.bulkPrice === null || raw.bulkQuantity === null) return null;
  const savingsPerUnit = raw.regularPrice - raw.bulkPrice / raw.bulkQuantity;
  if (savingsPerUnit <= 0) return null;
  return Math.round(savingsPerUnit * 12 * 100) / 100;
}

function toAmazonStoreResult(raw: AmazonRaw, sizeMismatch: boolean): AmazonStoreResult {
  return { ...raw, annualSavings: sizeMismatch ? null : computeAnnualSavings(raw) };
}

async function tryAmazonScrape(itemName: string): Promise<AmazonRaw | null> {
  try {
    const { scrapeAmazonPrice } = await import("@/lib/scrapers/amazon");
    const result = await scrapeAmazonPrice(itemName);
    if (!result) return null;
    return {
      price: result.price,
      productName: result.name,
      asin: result.asin,
      regularPrice: result.regularPrice,
      bulkPrice: result.bulkPrice,
      bulkQuantity: result.bulkQuantity,
      bulkAsin: result.bulkAsin,
    };
  } catch (err) {
    console.error(`[search-prices] Amazon error:`, err);
    return null;
  }
}

async function tryWalmartScrape(itemName: string): Promise<StoreResult | null> {
  try {
    const { scrapeWalmartPrice } = await import("@/lib/scrapers/walmart");
    const result = await scrapeWalmartPrice(itemName);
    if (!result) return null;
    return { price: result.price, productName: result.name };
  } catch (err) {
    console.error(`[search-prices] Walmart error:`, err);
    return null;
  }
}

const EMPTY_AMAZON_RAW: AmazonRaw = {
  price: null,
  productName: "",
  asin: null,
  regularPrice: null,
  bulkPrice: null,
  bulkQuantity: null,
  bulkAsin: null,
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.items || !Array.isArray(body.items)) {
    return Response.json({ error: "Provide an items array." }, { status: 400 });
  }

  const items: GroceryItem[] = body.items;
  const pricedItems: PricedItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Check cache first — skip scraping entirely on a hit.
    const cached = await getCachedPrice(item.name);
    if (cached) {
      console.log(`CACHED: ${item.name}`);
      const cachedAmazonRaw: AmazonRaw = cached.amazon ?? { ...EMPTY_AMAZON_RAW, productName: item.name };
      const cachedWalmart = cached.walmart ?? { price: null, productName: item.name };
      const amazonSize = parseSize(cachedAmazonRaw.productName, "Amazon");
      console.log("[parseSize]", cachedAmazonRaw.productName, "→", amazonSize?.quantity, amazonSize?.unit);
      const sizeMismatch = checkSizeMismatch(
        amazonSize,
        parseSize(cachedWalmart.productName, "Walmart")
      );
      pricedItems.push({
        ...item,
        amazon: toAmazonStoreResult(cachedAmazonRaw, sizeMismatch),
        walmart: cachedWalmart,
        samsclub: { price: null, productName: item.name },
        sizeMismatch,
      });
      continue;
    }

    if (i > 0) await new Promise((r) => setTimeout(r, 200));

    // Amazon + Walmart in parallel per item (different APIs, no shared rate limit).
    // Items remain sequential to avoid hammering either API.
    const [amazon, walmart] = await Promise.all([
      tryAmazonScrape(item.name),
      tryWalmartScrape(item.name),
    ]);

    if (amazon) console.log(`SCRAPED amazon: ${item.name} → $${amazon.price}`);
    else console.log(`UNAVAILABLE amazon: ${item.name}`);
    if (walmart) console.log(`SCRAPED walmart: ${item.name} → $${walmart.price}`);
    else console.log(`UNAVAILABLE walmart: ${item.name}`);

    await setCachedPrice(item.name, { amazon, walmart });

    const amazonSize = amazon ? parseSize(amazon.productName, "Amazon") : null;
    console.log("[parseSize]", amazon?.productName, "→", amazonSize?.quantity, amazonSize?.unit);
    const sizeMismatch = checkSizeMismatch(
      amazonSize,
      walmart ? parseSize(walmart.productName, "Walmart") : null
    );

    const amazonRaw: AmazonRaw = amazon ?? { ...EMPTY_AMAZON_RAW, productName: item.name };

    pricedItems.push({
      ...item,
      amazon: toAmazonStoreResult(amazonRaw, sizeMismatch),
      walmart: walmart ?? { price: null, productName: item.name },
      samsclub: { price: null, productName: item.name },
      sizeMismatch,
    });
  }

  const flour = pricedItems.find((i) => i.name.toLowerCase().includes("flour"));
  if (flour) console.log("[response item]", JSON.stringify(flour, null, 2));

  const round = (n: number) => Math.round(n * 100) / 100;
  const amazonTotal = round(pricedItems.reduce((s, i) => s + (i.amazon.price ?? 0), 0));
  const walmartTotal = round(pricedItems.reduce((s, i) => s + (i.walmart.price ?? 0), 0));
  const samsclubTotal = 0;

  return Response.json({ items: pricedItems, amazonTotal, walmartTotal, samsclubTotal });
}
