export type ParsedUnit = { quantity: number; unit: string };

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase().trim();
  if (/^fl[\.\s]*oz/.test(u)) return "fl oz";
  if (/^(oz|ounce|ounces)$/.test(u)) return "oz";
  if (/^(count|ct)$/.test(u)) return "count";
  if (/^(lb|lbs|pound|pounds)$/.test(u)) return "lb";
  if (/^(g|gram|grams)$/.test(u)) return "g";
  if (/^(kg|kilogram|kilograms)$/.test(u)) return "kg";
  if (/^(ml|milliliter|milliliters)$/.test(u)) return "ml";
  if (/^(l|liter|liters)$/.test(u)) return "L";
  if (/^(pk|pack|packs)$/.test(u)) return "pack";
  if (/rolls?$/.test(u)) return "rolls";
  if (/^(each|ea)$/.test(u)) return "each";
  return u;
}

export function parseUnit(productName: string): ParsedUnit | null {
  // "Pack of N"
  const packOf = productName.match(/\bpack\s+of\s+(\d+(?:\.\d+)?)\b/i);
  if (packOf) return { quantity: Number(packOf[1]), unit: "pack" };

  // "N fl oz" — must come before oz check
  const flOz = productName.match(/(\d+(?:\.\d+)?)\s*fl[\.\s]*oz\b/i);
  if (flOz) return { quantity: Number(flOz[1]), unit: "fl oz" };

  // "N [modifiers] Rolls" (e.g. "6 Double Rolls", "18 Super Mega Rolls")
  const rolls = productName.match(/(\d+(?:\.\d+)?)\s+(?:\w+\s+)*rolls?\b/i);
  if (rolls) return { quantity: Number(rolls[1]), unit: "rolls" };

  // "N oz" — optional trailing descriptor like "Can", "Box"
  const oz = productName.match(/(\d+(?:\.\d+)?)\s*oz\b/i);
  if (oz) return { quantity: Number(oz[1]), unit: "oz" };

  // General: "N unit"
  const general = productName.match(
    /(\d+(?:\.\d+)?)\s+(count|ct|lb|lbs?|pounds?|g|grams?|kg|ml|liters?|[Ll]\b|pk|packs?|each|ea)\b/i
  );
  if (general) return { quantity: Number(general[1]), unit: normalizeUnit(general[2]) };

  return null;
}
