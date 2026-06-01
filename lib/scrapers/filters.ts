export const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "of", "in", "to", "is", "at", "by",
]);

// Deprioritise results whose names contain these words when the query doesn't.
// Merged from both Amazon and Walmart specialty lists.
export const SPECIALTY_WORDS = [
  "whitening", "2-in-1", "organic", "premium", "professional",
  "advanced", "extra strength", "sensitive", "charcoal", "natural",
  "plus", "pro", "ultra", "clinical", "maximum", "complete",
  "gluten-free", "gluten free", "blend", "alternative", "vegan",
  "keto", "paleo", "non-gmo", "plant-based",
];

// Hard-exclude results containing these subtype words when the query
// contains the category key but NOT the subtype word.
const NEGATIVE_KEYWORDS: Record<string, string[]> = {
  flour:      ["semolina", "almond", "coconut", "durum", "rye", "oat", "cassava", "tapioca", "arrowroot", "chickpea"],
  milk:       ["almond", "oat", "soy", "coconut", "cashew"],
  butter:     ["almond", "peanut", "cashew", "sunflower"],
  sugar:      ["stevia", "splenda", "monk fruit", "erythritol"],
  shampoo:    ["travel size", "travel", "mini"],
  conditioner:["travel size", "travel", "mini"],
};

// Minimum acceptable price per category — catches travel/trial sizes when pricePaid unavailable.
const CATEGORY_MIN_PRICES: { pattern: RegExp; minPrice: number }[] = [
  { pattern: /\b(shampoo|conditioner)\b/i, minPrice: 4 },
];

export function getCategoryMinPrice(query: string): number | null {
  for (const { pattern, minPrice } of CATEGORY_MIN_PRICES) {
    if (pattern.test(query)) return minPrice;
  }
  return null;
}

// When a specific descriptor from this table appears in the query, the corresponding
// word must also appear in the product name. Each entry is [queryPhrase, requiredInName].
// queryPhrase and requiredInName are often the same; they differ for tea (phrase vs single word).
const REQUIRED_DESCRIPTORS: [string, string][] = [
  // Pasta shapes — shape in query must match shape in product
  ...["rigatoni", "penne", "linguine", "spaghetti", "fettuccine", "fusilli",
      "rotini", "farfalle", "ziti", "angel hair", "lasagna", "lasagne"]
    .map((s): [string, string] => [s, s]),
  // Detergent / cleaning format
  ...["liquid", "powder", "pods", "tabs", "pacs"]
    .map((s): [string, string] => [s, s]),
  // Tea types — "green tea" in query requires "green" in product name
  ["green tea", "green"],
  ["black tea", "black"],
  ["herbal tea", "herbal"],
  ["white tea", "white"],
  ["oolong", "oolong"],
  // Specific nut types (butters, milks, flours, etc.)
  ...["almond", "peanut", "cashew", "walnut", "pecan"]
    .map((s): [string, string] => [s, s]),
];

export function isRelevant(productName: string, query: string): boolean {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (keywords.length === 0) return true;
  const nameWordSet = new Set(productName.toLowerCase().split(/\W+/).filter(Boolean));
  const matchCount = keywords.filter((kw) => nameWordSet.has(kw)).length;
  if (matchCount < Math.max(1, Math.ceil(keywords.length / 2))) return false;

  // Required descriptor check: if a specific descriptor appears in the query,
  // the corresponding word must appear in the product name.
  const queryLower = query.toLowerCase();
  const nameLower = productName.toLowerCase();
  // Group by which query phrases matched, then require at least one name word per group.
  // Entries share an implicit group when their query phrases are in the same category —
  // here we just check: for each matched query phrase, its required name word must be present.
  for (const [queryPhrase, requiredName] of REQUIRED_DESCRIPTORS) {
    if (queryLower.includes(queryPhrase) && !nameLower.includes(requiredName)) return false;
  }
  return true;
}

export function isSpecialty(productName: string, query: string): boolean {
  const queryLower = query.toLowerCase();
  const nameLower = productName.toLowerCase();
  return SPECIALTY_WORDS.some((w) => nameLower.includes(w) && !queryLower.includes(w));
}

// Capitalised words in the query (length > 2, not a stop word) are treated as brand names.
export function extractBrands(query: string): string[] {
  return query
    .split(/\s+/)
    .filter((w) => w.length > 2 && /^[A-Z]/.test(w) && !STOP_WORDS.has(w.toLowerCase()));
}

// Whole-word brand match: at least one brand word must appear as its own token in the name.
// Returns true when there are no brands (non-branded query → no restriction).
export function passesBrandCheck(productName: string, brands: string[]): boolean {
  if (brands.length === 0) return true;
  const nameWords = new Set(productName.toLowerCase().split(/\W+/).filter(Boolean));
  return brands.some((b) => nameWords.has(b.toLowerCase()));
}

// Returns false (and logs) when the product name contains an incompatible subtype word.
export function passesNegativeKeywords(productName: string, query: string, store: string): boolean {
  const queryLower = query.toLowerCase();
  const nameLower = productName.toLowerCase();
  for (const [category, exclusions] of Object.entries(NEGATIVE_KEYWORDS)) {
    if (!queryLower.includes(category)) continue;
    for (const exclusion of exclusions) {
      if (nameLower.includes(exclusion) && !queryLower.includes(exclusion)) {
        console.log(`[${store}] [NEGATIVE-KW: ${exclusion}] "${productName}" (query: "${query}")`);
        return false;
      }
    }
  }
  return true;
}
