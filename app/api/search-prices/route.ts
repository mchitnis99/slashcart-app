export const maxDuration = 60;

import { getCachedPrice, setCachedPrice } from "@/lib/cache";
import { parseUnit, type ParsedUnit } from "@/lib/utils/parseUnit";

type GroceryItem = {
  name: string;
  quantity: number;
  unit: string;
};

type StoreResult = {
  price: number | null;
  productName: string;
};

type AmazonStoreResult = {
  price: number | null;
  productName: string;
  asin: string | null;
  regularPrice: number | null;
  bulkPrice: number | null;
  bulkQuantity: number | null;
  bulkAsin: string | null;
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

// Normalise all weight units to oz so lb vs oz can be compared numerically.
// fl oz, count, rolls, pack stay as-is (already normalised by parseUnit).
function toComparableSize(parsed: ParsedUnit | null): { quantity: number; unit: string } | null {
  if (!parsed) return null;
  if (parsed.unit === "lb") return { quantity: parsed.quantity * 16, unit: "oz" };
  if (parsed.unit === "g")  return { quantity: parsed.quantity / 28.3495, unit: "oz" };
  if (parsed.unit === "kg") return { quantity: parsed.quantity * 35.274, unit: "oz" };
  return parsed; // fl oz, oz, count, rolls, pack
}

function checkSizeMismatch(a: ParsedUnit | null, b: ParsedUnit | null): boolean {
  const aSize = toComparableSize(a);
  const bSize = toComparableSize(b);
  if (!aSize || !bSize) return false;
  if (aSize.unit !== bSize.unit) return true; // e.g. count vs oz
  const ratio = Math.max(aSize.quantity, bSize.quantity) /
                Math.min(aSize.quantity, bSize.quantity);
  return ratio > 2;
}

async function tryAmazonScrape(itemName: string): Promise<AmazonStoreResult | null> {
  try {
    const { scrapeAmazonPrice } = await import("@/lib/scrapers/amazon");
    const result = await scrapeAmazonPrice(itemName);
    if (!result) return null;

    let annualSavings: number | null = null;
    if (result.regularPrice !== null && result.bulkPrice !== null && result.bulkQuantity !== null) {
      const savingsPerUnit = result.regularPrice - result.bulkPrice / result.bulkQuantity;
      if (savingsPerUnit > 0) {
        annualSavings = Math.round(savingsPerUnit * 12 * 100) / 100;
      }
    }

    return {
      price: result.price,
      productName: result.name,
      asin: result.asin,
      regularPrice: result.regularPrice,
      bulkPrice: result.bulkPrice,
      bulkQuantity: result.bulkQuantity,
      bulkAsin: result.bulkAsin,
      annualSavings,
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

const EMPTY_AMAZON: AmazonStoreResult = {
  price: null,
  productName: "",
  asin: null,
  regularPrice: null,
  bulkPrice: null,
  bulkQuantity: null,
  bulkAsin: null,
  annualSavings: null,
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
      const cachedAmazon = cached.amazon ?? { ...EMPTY_AMAZON, productName: item.name };
      const cachedWalmart = cached.walmart ?? { price: null, productName: item.name };
      const sizeMismatch = checkSizeMismatch(
        parseUnit(cachedAmazon.productName),
        parseUnit(cachedWalmart.productName)
      );
      pricedItems.push({
        ...item,
        amazon: { ...cachedAmazon, annualSavings: sizeMismatch ? null : cachedAmazon.annualSavings },
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

    const sizeMismatch = checkSizeMismatch(
      amazon ? parseUnit(amazon.productName) : null,
      walmart ? parseUnit(walmart.productName) : null
    );

    const finalAmazon: AmazonStoreResult = amazon
      ? { ...amazon, annualSavings: sizeMismatch ? null : amazon.annualSavings }
      : { ...EMPTY_AMAZON, productName: item.name };

    pricedItems.push({
      ...item,
      amazon: finalAmazon,
      walmart: walmart ?? { price: null, productName: item.name },
      samsclub: { price: null, productName: item.name },
      sizeMismatch,
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const amazonTotal = round(pricedItems.reduce((s, i) => s + (i.amazon.price ?? 0), 0));
  const walmartTotal = round(pricedItems.reduce((s, i) => s + (i.walmart.price ?? 0), 0));
  const samsclubTotal = 0;

  return Response.json({ items: pricedItems, amazonTotal, walmartTotal, samsclubTotal });
}
