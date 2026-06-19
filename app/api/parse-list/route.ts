import Anthropic from "@anthropic-ai/sdk";
import { findBaselinePrice } from "@/lib/baseline-matcher";

const client = new Anthropic();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { text, image, imageMediaType, mode } = body as {
    text?: string;
    image?: string;
    imageMediaType?: string;
    mode?: "receipt" | "product" | "shelf";
  };

  if (!text && !image) {
    return Response.json(
      { error: "Provide a grocery list text or image." },
      { status: 400 }
    );
  }

  const productLabelPrompt = `You are a product label reader. Identify the most prominent packaged product visible in the photo and extract its key details.

Return a JSON object with:
- items: array with ONE item for the main product shown
- excluded_items: [] (always empty — unless the product is fresh produce, meat, dairy, or deli, in which case put it in excluded_items and leave items empty)
- receiptTotal: null
- receiptStore: null

The single item must have:
- name: brand and product name in singular lowercase form. Include the brand if clearly legible on the label (e.g. "Goya organic chickpeas", "Barilla linguine fini", "Arm & Hammer baking soda"). Include meaningful descriptors (e.g. "organic", "extra virgin", "whole grain", "reduced sodium") but omit filler words.
- quantity: numeric size from the label (e.g. 15 for "15 oz", 1 for "1 lb", 16.9 for "16.9 fl oz"). Default to 1 if no size is printed.
- unit: unit from the label ("oz", "lbs", "fl oz", "g", "kg", "count"). Default to "count" if not printed.
- pricePaid: null

Return ONLY valid JSON — no markdown, no explanation.
Example: {"items":[{"name":"Goya organic chickpeas","quantity":15,"unit":"oz","pricePaid":null}],"excluded_items":[],"receiptTotal":null,"receiptStore":null}`;

  const shelfLabelPrompt = `You are reading a grocery store shelf label photo. Extract: brand name, full product name, size/quantity (number + unit), and the store price (labeled "YOU PAY" or the main price shown).

Return a JSON object with:
- items: array with ONE item for the product on this shelf label
- excluded_items: []
- receiptTotal: null
- receiptStore: null

The single item must have:
- name: brand and product name (e.g. "Goya organic chickpeas")
- quantity: numeric size from the label (number)
- unit: unit from the label ("oz", "lb", "fl oz", "ct", etc.)
- pricePaid: the store price as a number (from "YOU PAY" or the main price shown)

One item per label. Return ONLY valid JSON — no markdown, no explanation.
Example: {"items":[{"name":"Goya organic chickpeas","quantity":15,"unit":"oz","pricePaid":1.99}],"excluded_items":[],"receiptTotal":null,"receiptStore":null}`;

  const systemPrompt = mode === "product" ? productLabelPrompt : mode === "shelf" ? shelfLabelPrompt : `You are a grocery list parser. Extract grocery items from the user's input, classify each as "pantry_staple" or "fresh", and return a JSON object.

Pantry staples: canned goods, dry goods (pasta, rice, flour, oats), cereals, snacks, cleaning products, paper goods, oils, condiments, spices, beverages, frozen foods, packaged/processed foods.

Fresh items (EXCLUDE from items, add to excluded_items): fresh fruits and vegetables, fresh meat, fresh poultry, fresh fish and seafood, fresh deli items, fresh bakery items, dairy (milk, eggs, fresh cheese, yogurt, butter).

CRITICAL FRESH PRODUCE RULE: If an item is clearly fresh produce, fresh meat, fresh fish, or fresh bakery, you MUST exclude it — even if a packaged equivalent exists. Do NOT substitute or approximate:
- "apples" → excluded (do NOT convert to applesauce or apple juice)
- "chicken breast" → excluded (do NOT convert to canned chicken or Tyson frozen chicken)
- "salmon fillet" → excluded (do NOT convert to canned salmon)
- "sourdough bread" (fresh bakery loaf) → excluded (do NOT convert to packaged sandwich bread)
- "bananas", "spinach", "broccoli", "strawberries", "tomatoes" → all excluded
When in doubt about whether something is fresh vs. packaged, exclude it.

Each pantry_staple item in "items" must have:
- name: string (see brand name rules below)
- quantity: number (numeric value only, default 1 if unclear)
- unit: string (e.g. "lbs", "oz", "gallon", "dozen", "pack", "count" — use "count" if no unit specified)
- pricePaid: number | null — ONLY when parsing a receipt image with a visible price for that line item. Set to null or omit when parsing a typed list or when no price is visible for the item.

Each excluded item in "excluded_items" must have:
- name: string
- quantity: number
- unit: string
- pricePaid: number | null
- reason: "fresh produce — not available on Amazon or Walmart grocery"

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
10. When an item is a store brand (e.g. "ShopRite oats", "Kirkland olive oil", "Great Value flour", "Trader Joe's granola"), strip the store brand name and return only the generic product name (e.g. "old fashioned oats", "olive oil", "all purpose flour", "granola"). We will find the best equivalent across Amazon and Walmart — a generic search returns better results than a store-brand-specific search.

Return a JSON object with:
- items: pantry_staple items only
- excluded_items: fresh items only (each with a reason field)
- receiptTotal: number | null — the grand total shown on the receipt, if visible (null otherwise)
- receiptStore: string | null — the store name from the receipt header, if visible (null otherwise)

Rules:
- Consolidate duplicates
- Return ONLY valid JSON — no markdown, no explanation

Example output (receipt image):
{"items":[{"name":"King Arthur bread flour","quantity":1,"unit":"lbs","pricePaid":5.99},{"name":"Filippo Berio extra virgin olive oil","quantity":1,"unit":"count","pricePaid":8.49}],"excluded_items":[{"name":"chicken breast","quantity":2,"unit":"lbs","pricePaid":12.00,"reason":"fresh produce — not available on Amazon or Walmart grocery"},{"name":"bananas","quantity":3,"unit":"lbs","pricePaid":1.89,"reason":"fresh produce — not available on Amazon or Walmart grocery"}],"receiptTotal":127.43,"receiptStore":"Stop & Shop"}

Example output (typed list):
{"items":[{"name":"King Arthur bread flour","quantity":1,"unit":"lbs"},{"name":"Filippo Berio extra virgin olive oil","quantity":1,"unit":"count"}],"excluded_items":[{"name":"chicken breast","quantity":2,"unit":"lbs","reason":"fresh produce — not available on Amazon or Walmart grocery"}],"receiptTotal":null,"receiptStore":null}`;

  const userContent: Anthropic.MessageParam["content"] = [];

  if (image && imageMediaType) {
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const mediaType = validTypes.includes(imageMediaType)
      ? (imageMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
      : "image/jpeg";

    userContent.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: image },
    });
  }

  userContent.push({
    type: "text",
    text: mode === "product"
      ? "Identify the main product shown in this image and extract its details."
      : mode === "shelf"
        ? "Read the shelf label shown in this image and extract the product, size, and price."
        : text
          ? `Parse this grocery list:\n\n${text}`
          : "Parse the grocery list shown in this image.",
  });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Match a JSON object; fall back to trying the full response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { error: "Could not parse a grocery list from the input." },
        { status: 422 }
      );
    }

    type ParsedItem = { name: string; quantity: number; unit: string; pricePaid?: number | null; reason?: string };
    type ParsedShape = {
      items?: ParsedItem[];
      excluded_items?: ParsedItem[];
      receiptTotal?: number | null;
      receiptStore?: string | null;
    };

    let parsed: ParsedShape | ParsedItem[] | null = null;
    try {
      parsed = JSON.parse(jsonMatch[0]) as ParsedShape | ParsedItem[];
    } catch {
      // JSON was truncated — extract whatever complete item objects are present
      console.warn("[parse-list] JSON truncated, attempting partial extraction");
      const itemMatches = jsonMatch[0].matchAll(/\{[^{}]*"name"\s*:\s*"[^"]+(?:"(?:[^{}]*"name"\s*:\s*"[^"]*)*[^{}]*)?[^{}]*\}/g);
      const partialItems: ParsedItem[] = [];
      for (const m of itemMatches) {
        try {
          const obj = JSON.parse(m[0]) as ParsedItem;
          if (typeof obj.name === "string" && obj.name.length > 0) partialItems.push(obj);
        } catch { /* skip malformed objects */ }
      }
      if (partialItems.length === 0) {
        return Response.json(
          { error: "Could not parse a grocery list from the input." },
          { status: 422 }
        );
      }
      console.warn(`[parse-list] Partial extraction recovered ${partialItems.length} items`);
      parsed = partialItems;
    }

    // Handle legacy array response shape gracefully
    const items = Array.isArray(parsed) ? (parsed as ParsedItem[]) : (parsed.items ?? []);
    const excludedItems = Array.isArray(parsed) ? [] : (parsed.excluded_items ?? []);
    const receiptTotal = Array.isArray(parsed) ? null : (parsed.receiptTotal ?? null);
    const receiptStore = Array.isArray(parsed) ? null : (parsed.receiptStore ?? null);

    // Enrich typed-list items with baseline prices so the results page can compute PPU savings
    if (!image) {
      for (const item of items) {
        if (item.pricePaid == null) {
          const baseline = findBaselinePrice(item.name);
          if (baseline) {
            item.pricePaid = baseline.typical_price;
            item.quantity = baseline.size_value;
            item.unit = baseline.unit;
          }
        }
      }
    }

    return Response.json({ items, excluded_items: excludedItems, receipt_total: receiptTotal, receipt_store: receiptStore });
  } catch (err) {
    console.error("Anthropic API error:", err);
    return Response.json(
      { error: "AI parsing failed. Check your ANTHROPIC_API_KEY." },
      { status: 502 }
    );
  }
}
