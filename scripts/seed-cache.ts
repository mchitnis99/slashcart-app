/**
 * Seed the Supabase price cache by calling the local /api/search-prices endpoint.
 * Uses all existing filtering and caching logic — no direct scraper calls.
 *
 * Usage:
 *   npx tsx scripts/seed-cache.ts
 *
 * Requires the dev server to be running on http://localhost:3000 (or set BASE_URL env).
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const ITEMS = [
  // Baking & dry goods
  { name: "all purpose flour", quantity: 1, unit: "count" },
  { name: "bread flour", quantity: 1, unit: "count" },
  { name: "granulated sugar", quantity: 1, unit: "count" },
  { name: "brown sugar", quantity: 1, unit: "count" },
  { name: "powdered sugar", quantity: 1, unit: "count" },
  { name: "baking powder", quantity: 1, unit: "count" },
  { name: "baking soda", quantity: 1, unit: "count" },
  { name: "active dry yeast", quantity: 1, unit: "count" },
  { name: "cornstarch", quantity: 1, unit: "count" },
  { name: "old fashioned oats", quantity: 1, unit: "count" },
  { name: "white rice", quantity: 1, unit: "count" },
  { name: "brown rice", quantity: 1, unit: "count" },
  { name: "pasta spaghetti", quantity: 1, unit: "count" },
  { name: "pasta penne", quantity: 1, unit: "count" },
  { name: "pasta rigatoni", quantity: 1, unit: "count" },
  // Oils & condiments
  { name: "extra virgin olive oil", quantity: 1, unit: "count" },
  { name: "vegetable oil", quantity: 1, unit: "count" },
  { name: "canola oil", quantity: 1, unit: "count" },
  { name: "coconut oil", quantity: 1, unit: "count" },
  { name: "apple cider vinegar", quantity: 1, unit: "count" },
  { name: "soy sauce", quantity: 1, unit: "count" },
  { name: "ketchup", quantity: 1, unit: "count" },
  { name: "mustard", quantity: 1, unit: "count" },
  { name: "mayonnaise", quantity: 1, unit: "count" },
  { name: "hot sauce", quantity: 1, unit: "count" },
  // Canned & packaged
  { name: "canned diced tomatoes", quantity: 1, unit: "count" },
  { name: "canned black beans", quantity: 1, unit: "count" },
  { name: "canned chickpeas", quantity: 1, unit: "count" },
  { name: "canned tuna", quantity: 1, unit: "count" },
  { name: "chicken broth", quantity: 1, unit: "count" },
  { name: "peanut butter", quantity: 1, unit: "count" },
  { name: "almond butter", quantity: 1, unit: "count" },
  { name: "strawberry jam", quantity: 1, unit: "count" },
  { name: "honey", quantity: 1, unit: "count" },
  // Spices
  { name: "black pepper", quantity: 1, unit: "count" },
  { name: "kosher salt", quantity: 1, unit: "count" },
  { name: "garlic powder", quantity: 1, unit: "count" },
  { name: "onion powder", quantity: 1, unit: "count" },
  { name: "cumin", quantity: 1, unit: "count" },
  { name: "paprika", quantity: 1, unit: "count" },
  { name: "cinnamon", quantity: 1, unit: "count" },
  // Beverages
  { name: "coffee ground", quantity: 1, unit: "count" },
  { name: "green tea bags", quantity: 1, unit: "count" },
  { name: "black tea bags", quantity: 1, unit: "count" },
  { name: "sparkling water", quantity: 1, unit: "count" },
  // Household & personal care
  { name: "paper towels", quantity: 1, unit: "count" },
  { name: "toilet paper", quantity: 1, unit: "count" },
  { name: "dish soap", quantity: 1, unit: "count" },
  { name: "liquid laundry detergent", quantity: 1, unit: "count" },
  { name: "Colgate toothpaste", quantity: 1, unit: "count" },
  { name: "Dove soap", quantity: 1, unit: "count" },
  { name: "Q-Tips cotton swabs", quantity: 1, unit: "count" },
  { name: "Ziploc bags gallon", quantity: 1, unit: "count" },
  { name: "aluminum foil", quantity: 1, unit: "count" },
  { name: "plastic wrap", quantity: 1, unit: "count" },
];

const BATCH_SIZE = 5;

/** Mirror of normalizeCacheKey in app/api/search-prices/route.ts */
function normalizeCacheKey(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).sort().join(" ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedBatch(batch: typeof ITEMS) {
  const res = await fetch(`${BASE_URL}/api/search-prices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: batch }),
  });

  if (!res.ok || !res.body) {
    console.error(`  ✗ HTTP ${res.status} for batch [${batch.map((i) => i.name).join(", ")}]`);
    return;
  }

  // Consume the NDJSON stream so the server completes all scrapes and writes to cache
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { type: string; index?: number; data?: { name: string } };
        if (msg.type === "item" && msg.data) {
          const itemName = batch[msg.index!]?.name ?? "";
          console.log(`  ✓ "${itemName}" (key: "${normalizeCacheKey(itemName)}") → "${msg.data.name}"`);
        }
      } catch { /* ignore malformed lines */ }
    }
  }
}

async function main() {
  console.log(`Seeding cache via ${BASE_URL}/api/search-prices`);
  console.log(`${ITEMS.length} items · batch size ${BATCH_SIZE}\n`);

  for (let i = 0; i < ITEMS.length; i += BATCH_SIZE) {
    const batch = ITEMS.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ITEMS.length / BATCH_SIZE)}: ${batch.map((x) => x.name).join(", ")}`);
    await seedBatch(batch);
    if (i + BATCH_SIZE < ITEMS.length) await sleep(1000); // brief pause between batches
  }

  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
