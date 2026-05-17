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

// Seeded random so results are stable per item name
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return ((h >>> 0) / 4294967296);
  };
}

function mockPriceForStore(item: GroceryItem, store: string): StorePrice {
  const rand = seededRandom(`${item.name}|${store}`);

  // Base price per unit — rough real-world ranges
  const basePrices: Record<string, number> = {
    eggs: 4.5,
    milk: 3.8,
    bread: 3.2,
    butter: 5.5,
    chicken: 6.5,
    beef: 9.0,
    salmon: 12.0,
    rice: 2.5,
    pasta: 1.8,
    tomatoes: 2.2,
    apples: 1.8,
    bananas: 0.6,
    avocado: 1.2,
    spinach: 3.5,
    broccoli: 2.4,
    cheese: 5.0,
    yogurt: 4.2,
    orange_juice: 5.5,
    coffee: 10.0,
    olive_oil: 8.5,
  };

  const nameKey = item.name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .split("_")
    .find((k) => basePrices[k]) ?? "";
  const baseUnit = basePrices[nameKey] ?? 2.5 + rand() * 8;

  // Store multipliers
  const multipliers: Record<string, number> = {
    Walmart: 0.88,
    "Whole Foods": 1.35,
    Target: 1.05,
    Instacart: 1.15,
    Kroger: 0.95,
  };

  const variance = 0.9 + rand() * 0.2;
  const rawPrice = baseUnit * (multipliers[store] ?? 1) * variance * item.quantity;
  const price = Math.round(rawPrice * 100) / 100;

  // ~10% chance out of stock
  const inStock = rand() > 0.1;

  return { price: inStock ? price : null, inStock };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.items || !Array.isArray(body.items)) {
    return Response.json({ error: "Provide an items array." }, { status: 400 });
  }

  const items: GroceryItem[] = body.items;

  const pricedItems: PricedItem[] = items.map((item) => {
    const prices: Record<string, StorePrice> = {};
    for (const store of STORES) {
      prices[store] = mockPriceForStore(item, store);
    }
    return { ...item, prices };
  });

  // Compute per-store totals (sum only in-stock items)
  const totals: Record<string, number | null> = {};
  for (const store of STORES) {
    let total = 0;
    let anyNull = false;
    for (const item of pricedItems) {
      const p = item.prices[store].price;
      if (p === null) {
        anyNull = true;
      } else {
        total += p;
      }
    }
    totals[store] = anyNull ? null : Math.round(total * 100) / 100;
  }

  return Response.json({ items: pricedItems, stores: STORES, totals });
}
