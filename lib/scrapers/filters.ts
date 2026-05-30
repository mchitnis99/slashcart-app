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
  flour:  ["semolina", "almond", "coconut", "durum", "rye", "oat", "cassava", "tapioca", "arrowroot", "chickpea"],
  milk:   ["almond", "oat", "soy", "coconut", "cashew"],
  butter: ["almond", "peanut", "cashew", "sunflower"],
  sugar:  ["stevia", "splenda", "monk fruit", "erythritol"],
};

export function isRelevant(productName: string, query: string): boolean {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (keywords.length === 0) return true;
  const nameWords = new Set(productName.toLowerCase().split(/\W+/).filter(Boolean));
  const matchCount = keywords.filter((kw) => nameWords.has(kw)).length;
  return matchCount >= Math.max(1, Math.ceil(keywords.length / 2));
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
