export type ParsedUnit = { quantity: number; unit: string };

const LITERS_TO_FL_OZ = 33.814;
const ML_TO_FL_OZ = 0.033814;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase().trim();
  if (/^fl[\.\s]*oz/.test(u)) return "fl oz";
  if (/^(oz|ounce|ounces)$/.test(u)) return "oz";
  if (/^(count|ct)$/.test(u)) return "count";
  if (/^(lb|lbs|pound|pounds)$/.test(u)) return "lb";
  if (/^(g|gram|grams)$/.test(u)) return "g";
  if (/^(kg|kilogram|kilograms)$/.test(u)) return "kg";
  if (/^(pk|pack|packs)$/.test(u)) return "pack";
  if (/rolls?$/.test(u)) return "rolls";
  if (/sheets?$/.test(u)) return "sheets";
  if (/^(each|ea)$/.test(u)) return "each";
  return u;
}

export function parseUnit(productName: string): ParsedUnit | null {
  // "Pack of N"
  const packOf = productName.match(/\bpack\s+of\s+(\d+(?:\.\d+)?)\b/i);
  if (packOf) return { quantity: Number(packOf[1]), unit: "pack" };

  // "N fl oz" — must come before oz and liter checks
  const flOz = productName.match(/(\d+(?:\.\d+)?)\s*fl[\.\s]*oz\b/i);
  if (flOz) return { quantity: Number(flOz[1]), unit: "fl oz" };

  // "N count" / "N-Count" / "N ct" (e.g. "45 count", "102-Count", "45 ct")
  const count = productName.match(/(\d+(?:\.\d+)?)[- ]+(count|ct)\b/i);
  if (count) return { quantity: Number(count[1]), unit: "count" };

  // "N [modifiers] Rolls" (e.g. "6 Double Rolls", "18 Super Mega Rolls")
  const rolls = productName.match(/(\d+(?:\.\d+)?)\s+(?:\w+\s+)*rolls?\b/i);
  if (rolls) return { quantity: Number(rolls[1]), unit: "rolls" };

  // "N [modifiers] Sheets" (e.g. "120 Sheets", "2-ply Sheets")
  const sheets = productName.match(/(\d+(?:\.\d+)?)\s+(?:\w+\s+)*sheets?\b/i);
  if (sheets) return { quantity: Number(sheets[1]), unit: "sheets" };

  // ml → fl oz (e.g. "500ml", "750 ml") — before liter check to avoid "ml" matching "l"
  const ml = productName.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ml) return { quantity: round2(Number(ml[1]) * ML_TO_FL_OZ), unit: "fl oz" };

  // Liters/litres/LT/L → fl oz (e.g. "1 LT", "1.5L", "1 liter", "1 litre")
  const liters = productName.match(/(\d+(?:\.\d+)?)\s*(?:lt|liters?|litres?|l)\b/i);
  if (liters) return { quantity: round2(Number(liters[1]) * LITERS_TO_FL_OZ), unit: "fl oz" };

  // "N oz" — optional trailing descriptor like "Can", "Box"
  const oz = productName.match(/(\d+(?:\.\d+)?)\s*oz\b/i);
  if (oz) return { quantity: Number(oz[1]), unit: "oz" };

  // General: "N unit"
  const general = productName.match(
    /(\d+(?:\.\d+)?)\s+(lb|lbs?|pounds?|g|grams?|kg|pk|packs?|each|ea)\b/i
  );
  if (general) return { quantity: Number(general[1]), unit: normalizeUnit(general[2]) };

  return null;
}
