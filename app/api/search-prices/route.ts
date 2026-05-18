type GroceryItem = {
  name: string;
  quantity: number;
  unit: string;
};

type StorePrice = {
  price: number | null;
  inStock: boolean;
};

type PricedItem = {
  name: string;
  quantity: number;
  unit: string;
  prices: Record<string, StorePrice>;
};

const STORES = ["Walmart", "Whole Foods", "Target", "Instacart", "Kroger"];

// Realistic US grocery base prices per standard unit (lb, each, gallon, etc.)
const BASE_PRICES: Record<string, number> = {
  // Proteins
  chicken: 5.49,
  beef: 6.99,
  ground_beef: 5.99,
  pork: 4.99,
  salmon: 11.99,
  tuna: 1.89,
  shrimp: 9.99,
  turkey: 4.49,
  bacon: 6.99,
  sausage: 4.99,
  // Dairy
  egg: 4.29,
  eggs: 4.29,
  milk: 3.49,
  butter: 4.99,
  cheese: 4.99,
  yogurt: 2.19,
  low_fat_yogurt: 2.19,
  greek_yogurt: 2.49,
  cream: 3.99,
  sour_cream: 2.49,
  cream_cheese: 3.29,
  // Bread & Grains
  bread: 3.49,
  pasta: 1.69,
  rice: 2.29,
  tortilla: 3.49,
  tortillas: 3.49,
  cereal: 4.99,
  oat: 3.99,
  oats: 3.99,
  flour: 3.49,
  // Produce — fruits
  apple: 1.49,
  apples: 1.49,
  banana: 0.29,
  bananas: 0.89,
  orange: 0.99,
  oranges: 0.99,
  lemon: 0.79,
  lemons: 0.79,
  lime: 0.59,
  limes: 0.59,
  strawberry: 3.99,
  strawberries: 3.99,
  blueberry: 4.49,
  blueberries: 4.49,
  grape: 2.99,
  grapes: 2.99,
  avocado: 1.19,
  avocados: 1.19,
  mango: 1.29,
  pineapple: 2.99,
  watermelon: 5.99,
  peach: 1.49,
  peaches: 1.49,
  // Produce — vegetables
  tomato: 1.99,
  tomatoes: 1.99,
  onion: 0.99,
  onions: 0.99,
  garlic: 0.79,
  potato: 0.89,
  potatoes: 3.49,
  sweet_potato: 1.29,
  carrot: 0.79,
  carrots: 1.99,
  broccoli: 2.29,
  spinach: 3.49,
  kale: 2.99,
  lettuce: 2.49,
  cucumber: 0.89,
  pepper: 1.29,
  peppers: 3.49,
  mushroom: 2.99,
  mushrooms: 2.99,
  celery: 2.49,
  corn: 0.79,
  zucchini: 1.49,
  cauliflower: 3.49,
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
  pepper_spice: 3.49,
  // Beverages
  juice: 3.99,
  orange_juice: 4.99,
  coffee: 9.99,
  tea: 4.49,
  soda: 6.49,
  water: 5.99,
  sparkling_water: 5.49,
  beer: 12.99,
  wine: 12.99,
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

  // Exact match (with underscores)
  if (BASE_PRICES[normalized]) return BASE_PRICES[normalized];

  // Try each word and common plural/singular variations
  const words = normalized.split("_");
  for (const word of words) {
    const variations = [
      word,
      word + "s",                        // banana → bananas
      word.replace(/ies$/, "y"),          // berries → berry
      word.replace(/es$/, ""),            // tomatoes → tomato
      word.replace(/s$/, ""),             // apples → apple
    ];
    for (const v of variations) {
      if (BASE_PRICES[v]) return BASE_PRICES[v];
    }
  }

  // Try combined key variations (e.g. "orange juice" → "orange_juice")
  if (BASE_PRICES[normalized]) return BASE_PRICES[normalized];

  // Reasonable fallback range for unknown items ($1.50–$6.50)
  return 1.5 + rand() * 5;
}

// Store multipliers reflect real-world price positioning
const STORE_MULTIPLIERS: Record<string, number> = {
  Walmart: 0.87,
  "Whole Foods": 1.38,
  Target: 1.06,
  Instacart: 1.18,  // includes service markup
  Kroger: 0.94,
};

// Units that describe package size rather than quantity of packages.
// "16oz yogurt" means 1 container, not 16 separate items.
const PACKAGE_SIZE_UNITS = new Set(["oz", "fl oz", "floz", "ml", "g", "mg", "cl"]);

function mockPriceForStore(item: GroceryItem, store: string): StorePrice {
  const rand = seededRandom(`${item.name}|${store}`);
  const base = findBasePrice(item.name, rand);
  const multiplier = STORE_MULTIPLIERS[store] ?? 1;
  // ±7% variance per store so prices feel independently sourced
  const variance = 0.93 + rand() * 0.14;
  const normalizedUnit = item.unit.toLowerCase().trim().replace(/\s+/g, "");
  const qty = PACKAGE_SIZE_UNITS.has(normalizedUnit) ? 1 : item.quantity;
  const rawPrice = base * multiplier * variance * qty;
  const price = Math.round(rawPrice * 100) / 100;

  // ~8% chance out of stock
  const inStock = rand() > 0.08;

  return { price: inStock ? price : null, inStock };
}

type InstacartResult = { store: string; price: number; productName: string };

// Scrape Instacart once per item; resolve [] on timeout/failure so caller can fall back.
async function tryInstacartScrape(
  itemName: string,
  zipCode: string | undefined,
  timeoutMs: number
): Promise<InstacartResult[]> {
  if (!zipCode) return [];
  const { scrapeInstacartPrices } = await import("@/lib/scrapers/instacart");
  const timeout = new Promise<InstacartResult[]>((resolve) =>
    setTimeout(() => resolve([]), timeoutMs)
  );
  return Promise.race([scrapeInstacartPrices(itemName, zipCode), timeout]);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.items || !Array.isArray(body.items)) {
    return Response.json({ error: "Provide an items array." }, { status: 400 });
  }

  const items: GroceryItem[] = body.items;
  const zipCode: string | undefined = body.zipCode || undefined;

  // Scrape all items from Instacart in parallel (30s timeout per item)
  const scrapeResults = await Promise.all(
    items.map((item) => tryInstacartScrape(item.name, zipCode, 30000))
  );

  // Union store names from all real results; fall back to mock store list if none
  const storeSet = new Set<string>();
  for (const result of scrapeResults) {
    for (const r of result) storeSet.add(r.store);
  }
  const useMock = storeSet.size === 0;
  const stores = useMock ? STORES : [...storeSet];

  const pricedItems: PricedItem[] = items.map((item, i) => {
    const prices: Record<string, StorePrice> = {};
    const scraped = scrapeResults[i];

    for (const store of stores) {
      if (useMock || scraped.length === 0) {
        // Entire scrape failed — mock this item
        prices[store] = mockPriceForStore(item, store);
        console.log(`MOCKED: ${item.name} at ${store}`);
      } else {
        const match = scraped.find((r) => r.store === store);
        if (match) {
          console.log(`SCRAPED: ${item.name} at ${store} → $${match.price}`);
          prices[store] = { price: match.price, inStock: true };
        } else {
          prices[store] = { price: null, inStock: false };
        }
      }
    }

    return { ...item, prices };
  });

  // Per-store totals — only count available items
  const totals: Record<string, number | null> = {};
  for (const store of stores) {
    let total = 0;
    let hasOutOfStock = false;
    for (const item of pricedItems) {
      const p = item.prices[store].price;
      if (p === null) hasOutOfStock = true;
      else total += p;
    }
    totals[store] = hasOutOfStock ? null : Math.round(total * 100) / 100;
  }

  return Response.json({ items: pricedItems, stores, totals });
}
