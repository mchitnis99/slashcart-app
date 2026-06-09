/**
 * Test receipt/cart photo parsing directly against the Anthropic API.
 * Bypasses the Next.js server — useful for debugging prompt or image issues.
 *
 * Usage:
 *   npx tsx scripts/test-cart-photo.ts <image-path>
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a grocery list parser. Extract grocery items from the user's input, classify each as "pantry_staple" or "fresh", and return a JSON object.

Pantry staples: canned goods, dry goods (pasta, rice, flour, oats), cereals, snacks, cleaning products, paper goods, oils, condiments, spices, beverages, frozen foods, packaged/processed foods.
Fresh items: meat, poultry, fish/seafood, fresh produce (fruits and vegetables), dairy, deli, bakery.

Each item must have:
- name: string (see brand name rules below)
- quantity: number (numeric value only, default 1 if unclear)
- unit: string (e.g. "lbs", "oz", "gallon", "dozen", "pack", "count" — use "count" if no unit specified)
- pricePaid: number | null — ONLY when parsing a receipt image with a visible price for that line item. Set to null or omit when parsing a typed list or when no price is visible for the item.

The input is from a grocery store receipt. The store name (e.g. "Stop & Shop", "Whole Foods", "Walmart", "Kroger", "Safeway") will appear on the receipt but is NEVER a brand name for any item. Never include the store name as part of any item name.

Brand name rules — follow these exactly:
1. Preserve the exact brand name from the input. If the receipt says "Filippo Berio EVOO", return "Filippo Berio extra virgin olive oil" — never substitute a different brand (e.g. never return "Bertolli extra virgin olive oil").
2. Expand abbreviations to the most likely full brand and product name (e.g. "FLPPO BERO EVOO" → "Filippo Berio extra virgin olive oil", "TJ EVOO" → "Trader Joe's extra virgin olive oil").
3. Do not invent or infer brand names that are not clearly visible in the input. Store brand names (like "Stop & Shop", "Kirkland", "Great Value") should only be included if explicitly printed next to that item. If you are uncertain about a brand name, omit it and return just the generic product name (e.g. "extra virgin olive oil").
4. Be consistent — identical input must always produce identical output names.
5. Normalize to singular lowercase form, excluding quantity/size (e.g. "2 lbs King Arthur bread flour" → name: "King Arthur bread flour", quantity: 2, unit: "lbs").
6. When in doubt about a brand name, omit it entirely and return only the generic product name. It is always better to search for "old fashioned oats" than "Bob's Red Mill old fashioned oats" if Bob's Red Mill is not clearly printed next to that item on the receipt. Generic searches return better results than wrong brand searches.
7. The word "butter" should only appear in an item name if the product is literally butter or a butter substitute. Do not append "butter" to oil products — "avocado oil" is not "avocado oil butter".
8. If an item has a negative price (from a coupon, discount, rebate, or return line on the receipt), set pricePaid to null — never use negative values for pricePaid.
9. If the same product appears multiple times on a receipt (e.g. as a purchase and then a coupon/discount for the same item), only include it once — use the net price if available (purchase price minus discount), otherwise use the purchase price. Do not create separate line items for coupons, discounts, or returns of items already listed.
9. When an item is a store brand (e.g. "ShopRite oats", "Kirkland olive oil", "Great Value flour", "Trader Joe's granola"), strip the store brand name and return only the generic product name (e.g. "old fashioned oats", "olive oil", "all purpose flour", "granola"). We will find the best equivalent across Amazon and Walmart — a generic search returns better results than a store-brand-specific search.

Return a JSON object with:
- items: pantry_staple items only
- excluded_items: fresh items only
- receiptTotal: number | null — the grand total shown on the receipt, if visible (null otherwise)
- receiptStore: string | null — the store name from the receipt header, if visible (null otherwise)

Rules:
- Consolidate duplicates
- Return ONLY valid JSON — no markdown, no explanation

Example output (receipt image):
{"items":[{"name":"King Arthur bread flour","quantity":1,"unit":"lbs","pricePaid":5.99},{"name":"Filippo Berio extra virgin olive oil","quantity":1,"unit":"count","pricePaid":8.49}],"excluded_items":[{"name":"chicken breast","quantity":2,"unit":"lbs","pricePaid":12.00}],"receiptTotal":127.43,"receiptStore":"Stop & Shop"}`;

const MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: npx tsx scripts/test-cart-photo.ts <image-path>");
    process.exit(1);
  }

  const resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const ext = path.extname(resolved).toLowerCase();
  const mediaType = MEDIA_TYPES[ext] ?? "image/jpeg";
  const base64 = fs.readFileSync(resolved).toString("base64");

  console.error(`Sending ${path.basename(resolved)} (${mediaType}) to Claude…\n`);

  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "Parse the grocery list shown in this image." },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();
  const raw = message.content.find((b) => b.type === "text")?.text ?? "";

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("No JSON found in response:\n", raw);
    process.exit(1);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  console.log(JSON.stringify(parsed, null, 2));

  const { items = [], excluded_items = [] } = parsed;
  console.error(`\n✓ ${items.length} pantry item(s), ${excluded_items.length} excluded (fresh)`);
  if (parsed.receiptStore) console.error(`  Store: ${parsed.receiptStore}`);
  if (parsed.receiptTotal != null) console.error(`  Total: $${parsed.receiptTotal}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
