import { parseUnit, type ParsedUnit } from "@/lib/utils/parseUnit";

export type { ParsedUnit };

// Normalises all weight units to oz so lb/g/kg can be compared numerically.
// Volume (fl oz) and discrete (count, rolls, pack) pass through unchanged.
export function toComparableSize(parsed: ParsedUnit | null): { quantity: number; unit: string } | null {
  if (!parsed) return null;
  if (parsed.unit === "lb") return { quantity: parsed.quantity * 16, unit: "oz" };
  if (parsed.unit === "g")  return { quantity: parsed.quantity / 28.3495, unit: "oz" };
  if (parsed.unit === "kg") return { quantity: parsed.quantity * 35.274, unit: "oz" };
  return parsed;
}

// Extends parseUnit with: no-space variants (5lb, 80oz) and spelled-out words
// (ounce, ounces, pound, pounds, fluid ounce, liter, gram, kilogram, etc.).
// Pass `store` (server-side only) to get a console.warn on unparseable names.
export function parseSize(productName: string, store?: string): ParsedUnit | null {
  const parsed = parseUnit(productName);
  if (parsed) return parsed;

  const m = productName.match(
    /(\d+(?:\.\d+)?)\s*(fluid\s+ounces?|fl\.?\s*oz|ounces?|oz|pounds?|lbs?|lb|kilograms?|kg|grams?|g(?![a-z])|ml|litr(?:es?|ers?)|count|ct)\b/i
  );
  if (m) {
    const qty = Number(m[1]);
    const raw = m[2].toLowerCase().replace(/\s+/g, " ").trim();
    if (raw.startsWith("fluid") || raw.startsWith("fl")) return { quantity: qty, unit: "fl oz" };
    if (raw.startsWith("oz") || raw.startsWith("ounce"))  return { quantity: qty, unit: "oz" };
    if (raw.startsWith("lb") || raw.startsWith("pound"))  return { quantity: qty, unit: "lb" };
    if (raw.startsWith("kg") || raw.startsWith("kilogram")) return { quantity: qty * 35.274, unit: "oz" };
    if (raw === "g" || raw.startsWith("gram"))            return { quantity: qty / 28.3495, unit: "oz" };
    if (raw === "ml")                                     return { quantity: Math.round(qty * 0.033814 * 100) / 100, unit: "fl oz" };
    if (raw.startsWith("litr"))                           return { quantity: Math.round(qty * 33.814  * 100) / 100, unit: "fl oz" };
    if (raw === "count" || raw === "ct")                  return { quantity: qty, unit: "count" };
  }

  if (store && productName.trim().length > 0) {
    console.warn(`[size] No parseable size for ${store}: "${productName}"`);
  }
  return null;
}
