type GroceryItem = {
  name: string;
  quantity: number;
  unit: string;
};

type PricedItem = {
  name: string;
  quantity: number;
  unit: string;
  amazonPrice: number | null;
  productName: string;
};


async function tryAmazonScrape(
  itemName: string,
  timeoutMs: number
): Promise<{ price: number; productName: string } | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    const { scrapeAmazonPrice } = await import("@/lib/scrapers/amazon");
    const result = await Promise.race([scrapeAmazonPrice(itemName), timeout]);
    if (!result) return null;
    return { price: result.price, productName: result.name };
  } catch (err) {
    console.error(`[search-prices] Amazon scrape error:`, err);
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.items || !Array.isArray(body.items)) {
    return Response.json({ error: "Provide an items array." }, { status: 400 });
  }

  const items: GroceryItem[] = body.items;

  // Scrape items sequentially with 1s delay between requests to avoid 429s
  const pricedItems: PricedItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 300));

    const scraped = await tryAmazonScrape(item.name, 15000);
    if (scraped) {
      console.log(`SCRAPED: ${item.name} → $${scraped.price} (${scraped.productName})`);
      pricedItems.push({ ...item, amazonPrice: scraped.price, productName: scraped.productName });
    } else {
      console.log(`UNAVAILABLE: ${item.name}`);
      pricedItems.push({ ...item, amazonPrice: null, productName: item.name });
    }
  }

  const total = Math.round(
    pricedItems.reduce((sum, item) => sum + (item.amazonPrice ?? 0), 0) * 100
  ) / 100;

  return Response.json({ items: pricedItems, total });
}
