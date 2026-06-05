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
  oil:        ["spray"],
  shampoo:    ["travel size", "travel", "mini"],
  conditioner:["travel size", "travel", "mini"],
};

// Excluded from ALL results regardless of query category.
// Uses specific multi-word phrases to avoid false positives (e.g. "Mini-Wheats").
const GLOBAL_NEGATIVE_KEYWORDS = [
  "travel size", "travel pack", "trial size", "sample size", "on-the-go",
];

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

export function isRelevant(productName: string, query: string, store?: string): boolean {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (keywords.length === 0) return true;
  const nameWordSet = new Set(productName.toLowerCase().split(/\W+/).filter(Boolean));
  const matchCount = keywords.filter((kw) => nameWordSet.has(kw)).length;
  const threshold = Math.max(1, Math.ceil(keywords.length / 2));
  if (matchCount < threshold) {
    if (store) {
      const pct = Math.round((matchCount / keywords.length) * 100);
      console.log(`[${store}] RELEVANCE-SKIP: ${pct}% match (${matchCount}/${keywords.length} keywords) for "${productName}" (query: "${query}")`);
    }
    return false;
  }

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

// Store brand patterns — these are acceptable only for generic (no-brand) queries.
const STORE_BRAND_PATTERNS = [
  /\bamazon\s+(basics|grocery|fresh|brand)\b/i,
  /\bhappy\s+belly\b/i,
  /\bsolimo\b/i,
  /\bpresto\b/i,
  /\b365\s+by\s+whole\s+foods\b/i,
];

export function isStoreBrand(productName: string): boolean {
  return STORE_BRAND_PATTERNS.some((p) => p.test(productName));
}

// Variant groups: words within a group are mutually exclusive.
// If the query contains one, the product must contain that same one (not a different one).
const VARIANT_GROUPS: string[][] = [
  // Personal care scents / formulas
  ["aloe", "honey", "lavender", "cedar", "cedarwood", "rose", "rosemary",
   "mint", "eucalyptus", "citrus", "vanilla", "coconut", "shea", "argan", "tea tree",
   "original", "unscented", "fragrance free"],
  // Oral care flavors
  ["spearmint", "peppermint", "cinnamon", "bubblegum"],
  // Tuna / seafood packing medium (multi-word phrases listed before single words to win .find())
  ["olive oil", "spring water", "sweet corn", "oregano", "lemon", "garlic", "water"],
  // Jam / spread flavor
  ["mixed berry", "strawberry", "raspberry", "apricot", "blueberry", "goji", "superfruit"],
  // Oil type (single-word — must appear as a whole word to avoid "olive" matching "olivewood")
  ["avocado", "vegetable", "canola", "sesame"],
  // Bean / legume type
  ["cannellini", "chickpea", "lupini", "kidney", "pinto", "navy"],
];

// Returns { expectedVariant, foundVariant } if there is a conflict, or null if everything is fine.
export function passesVariantCheck(
  productName: string,
  query: string
): { expectedVariant: string; foundVariant: string } | null {
  const queryLower = query.toLowerCase();
  const nameLower = productName.toLowerCase();

  for (const group of VARIANT_GROUPS) {
    const queryVariant = group.find((v) => queryLower.includes(v));
    if (!queryVariant) continue;
    // Guard: skip candidates that are substrings of the query variant itself
    // (e.g. "water" is a substring of "spring water" — not a conflict)
    const foundVariant = group.find(
      (v) => nameLower.includes(v) && v !== queryVariant && !queryVariant.includes(v)
    );
    if (foundVariant) return { expectedVariant: queryVariant, foundVariant };
  }
  return null;
}

// Returns true if the product name contains at least one word from any variant group.
// Used to gate whether a result qualifies as a meaningful variant candidate.
export function hasVariantKeyword(productName: string): boolean {
  const nameLower = productName.toLowerCase();
  return VARIANT_GROUPS.flat().some((v) => nameLower.includes(v));
}

// Extract a short display label from a product name for use as a variant pill label.
// Checks VARIANT_GROUPS first (longest phrases first to prefer "olive oil" over "oil"),
// then falls back to a parseable size token, then the first two words.
export function extractVariantLabel(productName: string): string {
  const nameLower = productName.toLowerCase();

  // Flatten all variant group words, sort longest first so multi-word phrases win
  const allVariants = VARIANT_GROUPS.flat().sort((a, b) => b.length - a.length);
  for (const v of allVariants) {
    if (nameLower.includes(v)) {
      return v.split(" ").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
    }
  }

  // Fall back to size token
  const SIZE_PATTERNS = [
    /\d+(?:\.\d+)?[\s\-]*fl[\s\-]*oz\b/i,
    /\d+(?:\.\d+)?[\s\-]*oz\b/i,
    /\d+(?:\.\d+)?[\s\-]*lb\b/i,
    /\d+(?:\.\d+)?[\s\-]*count\b/i,
  ];
  for (const p of SIZE_PATTERNS) {
    const m = productName.match(p);
    if (m) return m[0].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return productName.split(/\s+/).slice(0, 2).join(" ");
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

  // Global exclusions — always apply regardless of query category
  for (const exclusion of GLOBAL_NEGATIVE_KEYWORDS) {
    if (nameLower.includes(exclusion) && !queryLower.includes(exclusion)) {
      console.log(`[${store}] [NEGATIVE-KW: ${exclusion}] "${productName}" (query: "${query}")`);
      return false;
    }
  }

  // Category-specific exclusions — only apply when query contains the category word
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
