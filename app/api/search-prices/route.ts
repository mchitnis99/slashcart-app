export const maxDuration = 60;

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
};

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

    pricedItems.push({
      ...item,
      amazon: amazon ?? { ...EMPTY_AMAZON, productName: item.name },
      walmart: walmart ?? { price: null, productName: item.name },
      samsclub: { price: null, productName: item.name },
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const amazonTotal = round(pricedItems.reduce((s, i) => s + (i.amazon.price ?? 0), 0));
  const walmartTotal = round(pricedItems.reduce((s, i) => s + (i.walmart.price ?? 0), 0));
  const samsclubTotal = 0;

  return Response.json({ items: pricedItems, amazonTotal, walmartTotal, samsclubTotal });
}
