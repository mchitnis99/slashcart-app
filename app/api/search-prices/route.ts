type GroceryItem = {
  name: string;
  quantity: number;
  unit: string;
};

type StoreResult = {
  price: number | null;
  productName: string;
};

type PricedItem = {
  name: string;
  quantity: number;
  unit: string;
  amazon: StoreResult;
  walmart: StoreResult;
  costco: StoreResult;
};

async function tryAmazonScrape(
  itemName: string,
  timeoutMs: number
): Promise<StoreResult | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    const { scrapeAmazonPrice } = await import("@/lib/scrapers/amazon");
    const result = await Promise.race([scrapeAmazonPrice(itemName), timeout]);
    if (!result) return null;
    return { price: result.price, productName: result.name };
  } catch (err) {
    console.error(`[search-prices] Amazon error:`, err);
    return null;
  }
}

async function tryWalmartScrape(
  itemName: string,
  timeoutMs: number
): Promise<StoreResult | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    const { scrapeWalmartPrice } = await import("@/lib/scrapers/walmart");
    const result = await Promise.race([scrapeWalmartPrice(itemName), timeout]);
    if (!result) return null;
    return { price: result.price, productName: result.name };
  } catch (err) {
    console.error(`[search-prices] Walmart error:`, err);
    return null;
  }
}

async function tryCostcoScrape(
  itemName: string,
  timeoutMs: number
): Promise<StoreResult | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    const { scrapeCostcoPrice } = await import("@/lib/scrapers/costco");
    const result = await Promise.race([scrapeCostcoPrice(itemName), timeout]);
    if (!result) return null;
    return { price: result.price, productName: result.name };
  } catch (err) {
    console.error(`[search-prices] Costco error:`, err);
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.items || !Array.isArray(body.items)) {
    return Response.json({ error: "Provide an items array." }, { status: 400 });
  }

  const items: GroceryItem[] = body.items;
  const pricedItems: PricedItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 300));

    // All three stores fetched in parallel per item.
    // Costco gets a shorter timeout and an extra .catch() so any unhandled
    // rejection from that scraper cannot fail the whole Promise.all.
    const [amazon, walmart, costco] = await Promise.all([
      tryAmazonScrape(item.name, 15000),
      tryWalmartScrape(item.name, 15000),
      tryCostcoScrape(item.name, 8000).catch(() => null),
    ]);

    for (const [store, result] of [["amazon", amazon], ["walmart", walmart], ["costco", costco]] as const) {
      if (result) console.log(`SCRAPED ${store}: ${item.name} → $${result.price}`);
      else console.log(`UNAVAILABLE ${store}: ${item.name}`);
    }

    pricedItems.push({
      ...item,
      amazon: amazon ?? { price: null, productName: item.name },
      walmart: walmart ?? { price: null, productName: item.name },
      costco: costco ?? { price: null, productName: item.name },
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const amazonTotal = round(pricedItems.reduce((s, i) => s + (i.amazon.price ?? 0), 0));
  const walmartTotal = round(pricedItems.reduce((s, i) => s + (i.walmart.price ?? 0), 0));
  const costcoTotal = round(pricedItems.reduce((s, i) => s + (i.costco.price ?? 0), 0));

  return Response.json({ items: pricedItems, amazonTotal, walmartTotal, costcoTotal });
}
