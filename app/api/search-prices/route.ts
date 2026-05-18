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

// Realistic US grocery base prices per standard unit (lb, each, gallon, etc.)
const BASE_PRICES: Record<string, number> = {
  // Pantry — dry goods
  pasta: 1.69,
  rice: 2.29,
  flour: 3.49,
  oat: 3.99,
  oats: 3.99,
  cereal: 4.99,
  bread: 3.49,
  tortilla: 3.49,
  tortillas: 3.49,
  // Canned & Pantry
  beans: 1.19,
  lentils: 1.99,
  soup: 2.49,
  tomato_sauce: 1.29,
  olive_oil: 7.99,
  vegetable_oil: 4.99,
  vinegar: 2.49,
  soy_sauce: 2.99,
  ketchup: 3.29,
  mustard: 2.29,
  mayonnaise: 4.49,
  mayo: 4.49,
  salsa: 3.49,
  peanut_butter: 3.99,
  jelly: 3.49,
  jam: 3.49,
  honey: 5.99,
  sugar: 3.49,
  salt: 1.49,
  tuna: 1.89,
  // Beverages
  juice: 3.99,
  orange_juice: 4.99,
  coffee: 9.99,
  tea: 4.49,
  soda: 6.49,
  water: 5.99,
  sparkling_water: 5.49,
  // Frozen
  frozen_pizza: 6.99,
  ice_cream: 4.99,
  // Snacks
  chips: 4.49,
  crackers: 3.49,
  popcorn: 3.49,
  nuts: 7.99,
  chocolate: 3.49,
  granola_bar: 4.99,
  // Spices / condiments
  pepper_spice: 3.49,
  spice: 3.99,
  seasoning: 3.99,
  // Household / cleaning
  tide: 19.99,
  tide_pods: 19.99,
  laundry_pods: 19.99,
  laundry_detergent: 14.99,
  detergent: 14.99,
  dish_soap: 3.99,
  dish_detergent: 3.99,
  dishwasher_pods: 12.99,
  dishwasher_detergent: 12.99,
  paper_towels: 8.99,
  paper_towel: 8.99,
  toilet_paper: 12.99,
  trash_bags: 9.99,
  garbage_bags: 9.99,
  aluminum_foil: 3.99,
  plastic_wrap: 3.49,
  ziploc_bags: 4.99,
  ziplock_bags: 4.99,
  // Baking
  baking_soda: 1.29,
  baking_powder: 2.49,
  vanilla: 4.99,
  cocoa: 4.49,
  chocolate_chips: 3.99,
};

// Seeded deterministic pseudo-random per item+store pair
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function findBasePrice(itemName: string, rand: () => number): number {
  const normalized = itemName.toLowerCase().trim().replace(/\s+/g, "_");

  if (BASE_PRICES[normalized]) return BASE_PRICES[normalized];

  const words = normalized.split("_");
  for (const word of words) {
    const variations = [
      word,
      word + "s",
      word.replace(/ies$/, "y"),
      word.replace(/es$/, ""),
      word.replace(/s$/, ""),
    ];
    for (const v of variations) {
      if (BASE_PRICES[v]) return BASE_PRICES[v];
    }
  }

  // Fallback: household/pantry unknowns skew higher than food unknowns
  return 3.0 + rand() * 10;
}

const AMAZON_MULTIPLIER = 1.10;
const PACKAGE_SIZE_UNITS = new Set(["oz", "fl oz", "floz", "ml", "g", "mg", "cl"]);

function mockAmazonPrice(item: GroceryItem): number {
  const rand = seededRandom(`${item.name}|Amazon`);
  const base = findBasePrice(item.name, rand);
  const variance = 0.93 + rand() * 0.14;
  const normalizedUnit = item.unit.toLowerCase().trim().replace(/\s+/g, "");
  const qty = PACKAGE_SIZE_UNITS.has(normalizedUnit) ? 1 : item.quantity;
  return Math.round(base * AMAZON_MULTIPLIER * variance * qty * 100) / 100;
}

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
    if (i > 0) await new Promise((r) => setTimeout(r, 1000));

    const scraped = await tryAmazonScrape(item.name, 15000);
    if (scraped) {
      console.log(`SCRAPED: ${item.name} → $${scraped.price} (${scraped.productName})`);
      pricedItems.push({ ...item, amazonPrice: scraped.price, productName: scraped.productName });
    } else {
      const price = mockAmazonPrice(item);
      console.log(`MOCKED: ${item.name} → $${price}`);
      pricedItems.push({ ...item, amazonPrice: price, productName: item.name });
    }
  }

  const total = Math.round(
    pricedItems.reduce((sum, item) => sum + (item.amazonPrice ?? 0), 0) * 100
  ) / 100;

  return Response.json({ items: pricedItems, total });
}
