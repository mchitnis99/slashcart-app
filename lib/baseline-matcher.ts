import baselineData from "./baseline-prices.json";

export type BaselineItem = {
  name: string;
  brand: string;
  category: string;
  size: string;
  unit: string;
  size_value: number;
  typical_price: number;
  price_per_unit: number;
};

const BASELINE: BaselineItem[] = baselineData as BaselineItem[];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "with", "for",
  "oz", "lb", "lbs", "ct", "fl", "pack", "size", "value",
  "original", "classic", "regular",
]);

// All unique lowercase brand tokens from the dataset, longest first so
// multi-word brands ("Blue Buffalo") match before single words ("Blue").
const KNOWN_BRANDS: string[] = [...new Set(BASELINE.map((item) => item.brand.toLowerCase()))].sort(
  (a, b) => b.length - a.length
);

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/['",.!?&]/g, " ")   // strip punctuation
    .replace(/\d+(\.\d+)?\s*(fl\s*oz|oz|lb|lbs|ct|pk|pack|count|ounce|ounces|pound|pounds)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(str: string): string[] {
  return normalize(str)
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export function findBaselinePrice(itemName: string): BaselineItem | null {
  const normalizedQuery = normalize(itemName);

  // Detect brand in query — use the first known brand found
  let matchedBrand: string | null = null;
  for (const brand of KNOWN_BRANDS) {
    if (normalizedQuery.includes(brand)) {
      matchedBrand = brand;
      break;
    }
  }

  const candidates = matchedBrand
    ? BASELINE.filter((item) => item.brand.toLowerCase() === matchedBrand)
    : BASELINE;

  const queryWords = significantWords(itemName);
  if (queryWords.length === 0) return null;

  let best: BaselineItem | null = null;
  let bestScore = 0;

  for (const item of candidates) {
    const itemWords = new Set(significantWords(item.name));
    const score = queryWords.filter((w) => itemWords.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  // Brand identification is strong signal — lower threshold when brand was found
  const threshold = matchedBrand ? 1 : 2;
  return bestScore >= threshold ? best : null;
}

/*
Expected matches:

findBaselinePrice("skippy creamy peanut butter")
  → { name: "Skippy Creamy Peanut Butter 16.3oz", brand: "Skippy", ... }

findBaselinePrice("heinz ketchup")
  → { name: "Heinz Tomato Ketchup 32oz", brand: "Heinz", ... }

findBaselinePrice("cheerios")
  → null  (only 1 significant word; no brand found; threshold is 2 without brand)

findBaselinePrice("cheerios cereal")
  → { name: "Cheerios Original 18oz", brand: "Cheerios", ... }
     (brand "cheerios" identified → threshold drops to 1; "cheerios" scores 1)

findBaselinePrice("bounty paper towels")
  → { name: "Bounty Select-A-Size Paper Towels 8 rolls", brand: "Bounty", ... }

findBaselinePrice("tide pods")
  → { name: "Tide Pods Original 31ct", brand: "Tide", ... }
*/
