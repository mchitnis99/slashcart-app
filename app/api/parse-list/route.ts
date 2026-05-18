import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { text, image, imageMediaType } = body as {
    text?: string;
    image?: string;
    imageMediaType?: string;
  };

  if (!text && !image) {
    return Response.json(
      { error: "Provide a grocery list text or image." },
      { status: 400 }
    );
  }

  const systemPrompt = `You are a grocery list parser. Extract grocery items from the user's input, classify each as "pantry_staple" or "fresh", and return a JSON object.

Pantry staples: canned goods, dry goods (pasta, rice, flour, oats), cereals, snacks, cleaning products, paper goods, oils, condiments, spices, beverages, frozen foods, packaged/processed foods.
Fresh items: meat, poultry, fish/seafood, fresh produce (fruits and vegetables), dairy, deli, bakery.

Each item must have:
- name: string (normalized, singular form, e.g. "chicken breast" not "2 lbs chicken breasts")
- quantity: number (numeric value only, default 1 if unclear)
- unit: string (e.g. "lbs", "oz", "gallon", "dozen", "pack", "count" — use "count" if no unit specified)

Return a JSON object with two arrays:
- items: pantry_staple items only
- excluded_items: fresh items only

Rules:
- Consolidate duplicates
- Return ONLY valid JSON — no markdown, no explanation

Example output:
{"items":[{"name":"pasta","quantity":1,"unit":"lbs"},{"name":"olive oil","quantity":1,"unit":"count"}],"excluded_items":[{"name":"chicken breast","quantity":2,"unit":"lbs"},{"name":"milk","quantity":1,"unit":"gallon"}]}`;

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
    text: text
      ? `Parse this grocery list:\n\n${text}`
      : "Parse the grocery list shown in this image.",
  });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
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

    const parsed = JSON.parse(jsonMatch[0]) as {
      items?: Array<{ name: string; quantity: number; unit: string }>;
      excluded_items?: Array<{ name: string; quantity: number; unit: string }>;
    };

    // Handle legacy array response shape gracefully
    const items = Array.isArray(parsed)
      ? (parsed as Array<{ name: string; quantity: number; unit: string }>)
      : (parsed.items ?? []);
    const excludedItems = Array.isArray(parsed) ? [] : (parsed.excluded_items ?? []);

    return Response.json({ items, excluded_items: excludedItems });
  } catch (err) {
    console.error("Anthropic API error:", err);
    return Response.json(
      { error: "AI parsing failed. Check your ANTHROPIC_API_KEY." },
      { status: 502 }
    );
  }
}
