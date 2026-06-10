export const maxDuration = 60;

import { getCachedPrice, setCachedPrice } from "@/lib/cache";
import { type ParsedUnit } from "@/lib/utils/parseUnit";
import { parseSize, toComparableSize } from "@/lib/utils/parseSize";
import { extractBrands, passesBrandCheck, isStoreBrand, isRelevant, passesNegativeKeywords, matchesAllKeywords, isSpecialty } from "@/lib/scrapers/filters";

type GroceryItem = {
  name: string;
  quantity: number;
  unit: string;
  pricePaid?: number | null;
  preferredVariant?: string | null;
};

type StoreResultBase = {
  price: number | null;
  productName: string;
  url?: string | null;
  imageUrl?: string | null;
};
type StoreResult = StoreResultBase & { candidates?: StoreResultBase[] };

// Raw scraped fields only — matches what's stored in the Supabase cache.
type AmazonRawBase = {
  price: number | null;
  productName: string;
  asin: string | null;
  imageUrl?: string | null;
  regularPrice: number | null;
  bulkPrice: number | null;
  bulkQuantity: number | null;
  bulkAsin: string | null;
  isDifferentBrand: boolean;
};
type AmazonRaw = AmazonRawBase & { candidates?: AmazonRawBase[] };

// Enriched type returned to the client — includes derived annualSavings.
type AmazonStoreResult = AmazonRaw & {
  annualSavings: number | null;
};

type PricedItem = {
  name: string;
  quantity: number;
  unit: string;
  amazon: AmazonStoreResult;
  walmart: StoreResult;
  samsclub: StoreResult;
  sizeMismatch: boolean;
};


function checkSizeMismatch(a: ParsedUnit | null, b: ParsedUnit | null): boolean {
  const aSize = toComparableSize(a);
  const bSize = toComparableSize(b);
  if (!aSize || !bSize) return false;
  return aSize.unit !== bSize.unit; // only flag when unit types are incomparable
}

function computeAnnualSavings(raw: AmazonRaw): number | null {
  if (raw.regularPrice === null || raw.bulkPrice === null || raw.bulkQuantity === null) return null;
  const savingsPerUnit = raw.regularPrice - raw.bulkPrice / raw.bulkQuantity;
  if (savingsPerUnit <= 0) return null;
  return Math.round(savingsPerUnit * 12 * 100) / 100;
}

function toAmazonStoreResult(raw: AmazonRaw, sizeMismatch: boolean): AmazonStoreResult {
  return { ...raw, annualSavings: sizeMismatch ? null : computeAnnualSavings(raw) };
}

async function tryAmazonScrape(itemName: string, pricePaid?: number | null, preferredVariant?: string | null, queryQuantity?: number, queryUnit?: string): Promise<AmazonRaw | null> {
  try {
    const { scrapeAmazonPrice } = await import("@/lib/scrapers/amazon");
    const results = await scrapeAmazonPrice(itemName, pricePaid ?? undefined, preferredVariant ?? undefined, queryQuantity, queryUnit);
    if (!results || results.length === 0) return null;
    const primary = results[0];
    return {
      price: primary.price,
      productName: primary.name,
      asin: primary.asin,
      imageUrl: primary.imageUrl,
      regularPrice: primary.regularPrice,
      bulkPrice: primary.bulkPrice,
      bulkQuantity: primary.bulkQuantity,
      bulkAsin: primary.bulkAsin,
      isDifferentBrand: primary.isDifferentBrand,
      candidates: results.map((r) => ({
        price: r.price, productName: r.name, asin: r.asin, imageUrl: r.imageUrl ?? null,
        regularPrice: r.regularPrice, bulkPrice: r.bulkPrice, bulkQuantity: r.bulkQuantity, bulkAsin: r.bulkAsin,
        isDifferentBrand: r.isDifferentBrand,
      })),
    };
  } catch (err) {
    console.error(`[search-prices] Amazon error:`, err);
    return null;
  }
}

async function tryWalmartScrape(itemName: string, pricePaid?: number | null, queryQuantity?: number, queryUnit?: string): Promise<StoreResult | null> {
  try {
    const { scrapeWalmartPrice } = await import("@/lib/scrapers/walmart");
    const results = await scrapeWalmartPrice(itemName, pricePaid ?? undefined, queryQuantity, queryUnit);
    if (!results || results.length === 0) return null;
    const primary = results[0];
    return {
      price: primary.price, productName: primary.name, url: primary.url, imageUrl: primary.imageUrl,
      candidates: results.map((r) => ({ price: r.price, productName: r.name, url: r.url, imageUrl: r.imageUrl ?? null })),
    };
  } catch (err) {
    console.error(`[search-prices] Walmart error:`, err);
    return null;
  }
}

function normalizeCacheKey(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).sort().join(" ");
}

// Re-validates a cached Amazon primary against the current filtering rules. Cache entries
// written under older rule versions (e.g. before brand-check or negative-keyword updates)
// can pin a stale, lower-relevance result that a fresh scrape would no longer pick.
function isCachedAmazonStillValid(item: GroceryItem, amazon: AmazonRawBase): boolean {
  if (!amazon.productName) return false;
  const brands = extractBrands(item.name);
  if (brands.length > 0 && !amazon.isDifferentBrand) {
    if (isStoreBrand(amazon.productName) || !passesBrandCheck(amazon.productName, brands)) return false;
  }
  if (!isRelevant(amazon.productName, item.name, "amazon")) return false;
  if (!passesNegativeKeywords(amazon.productName, item.name, "amazon")) return false;
  // Every significant query word (e.g. "raisin", "bran") must appear in the cached
  // product name — isRelevant's looser threshold can let a different product
  // (e.g. "Shredded Wheat") through just by sharing the brand and one descriptor.
  if (!matchesAllKeywords(amazon.productName, item.name)) return false;
  // A specialty/special-edition/diet-modified variant (e.g. "Special Edition", "No Salt
  // Added") should never stay pinned as primary — re-scrape so the standard-first pool
  // ordering can pick a non-specialty result if one now exists.
  if (!amazon.isDifferentBrand && isSpecialty(amazon.productName, item.name)) return false;
  return true;
}

const EMPTY_AMAZON_RAW: AmazonRaw = {
  price: null,
  productName: "",
  asin: null,
  regularPrice: null,
  bulkPrice: null,
  bulkQuantity: null,
  bulkAsin: null,
  isDifferentBrand: false,
  candidates: [],
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.items || !Array.isArray(body.items)) {
    return Response.json({ error: "Provide an items array." }, { status: 400 });
  }

  const items: GroceryItem[] = body.items;

  async function processItem(item: GroceryItem): Promise<PricedItem> {
    const cacheKey = normalizeCacheKey(item.name);
    console.log(`[cache] key="${cacheKey}"`);
    const cached = await getCachedPrice(cacheKey);

    if (cached) {
      const cachedAmazonRaw: AmazonRaw = cached.amazon
        ? {
            ...cached.amazon,
            isDifferentBrand: cached.amazon.isDifferentBrand ?? false,
            candidates: (cached.amazon.candidates ?? [{ ...cached.amazon }]).map((c) => ({
              ...c,
              isDifferentBrand: c.isDifferentBrand ?? false,
            })),
          }
        : { ...EMPTY_AMAZON_RAW, productName: item.name };

      // A previously-empty Amazon result (cached.amazon === null) is always re-tried —
      // scraper logic and ScraperAPI results both change over time, so a one-time empty
      // result shouldn't permanently mark an item "Unavailable" for the full cache TTL.
      const amazonStale = cached.amazon === null || !isCachedAmazonStillValid(item, cachedAmazonRaw);
      if (amazonStale) {
        const reason = cached.amazon === null
          ? "no cached Amazon result"
          : `"${cachedAmazonRaw.productName}" no longer passes filters`;
        console.log(`[cache] STALE amazon for "${cacheKey}": ${reason}, re-scraping`);
      } else {
        console.log(`[cache] HIT: "${cacheKey}"`);
        const cachedWalmart: StoreResult = cached.walmart
          ? { ...cached.walmart, candidates: cached.walmart.candidates ?? [{ ...cached.walmart }] }
          : { price: null, productName: item.name };
        const amazonSize = parseSize(cachedAmazonRaw.productName, "Amazon");
        console.log("[parseSize]", cachedAmazonRaw.productName, "→", amazonSize?.quantity, amazonSize?.unit);
        const sizeMismatch = checkSizeMismatch(
          amazonSize,
          parseSize(cachedWalmart.productName, "Walmart")
        );
        return {
          ...item,
          amazon: toAmazonStoreResult(cachedAmazonRaw, sizeMismatch),
          walmart: cachedWalmart,
          samsclub: { price: null, productName: item.name },
          sizeMismatch,
        };
      }
    }

    console.log(`[cache] MISS: "${cacheKey}"`);
    const [amazon, walmart] = await Promise.all([
      tryAmazonScrape(item.name, item.pricePaid, item.preferredVariant, item.quantity, item.unit),
      tryWalmartScrape(item.name, item.pricePaid, item.quantity, item.unit),
    ]);

    if (amazon) console.log(`SCRAPED amazon: ${item.name} → $${amazon.price} (asin: ${amazon.asin})`);
    else console.log(`UNAVAILABLE amazon: ${item.name}`);
    if (walmart) console.log(`SCRAPED walmart: ${item.name} → $${walmart.price}`);
    else console.log(`UNAVAILABLE walmart: ${item.name}`);

    const hasPrice = (amazon?.price ?? null) !== null || (walmart?.price ?? null) !== null;
    if (hasPrice) {
      const writeOk = await setCachedPrice(cacheKey, { amazon, walmart });
      console.log(`[cache] write "${cacheKey}": ${writeOk ? "ok" : "FAILED"}`);
    } else {
      console.log(`[cache] skip write "${cacheKey}": no prices found on either store`);
    }

    const amazonSize = amazon ? parseSize(amazon.productName, "Amazon") : null;
    console.log("[parseSize]", amazon?.productName, "→", amazonSize?.quantity, amazonSize?.unit);
    const sizeMismatch = checkSizeMismatch(
      amazonSize,
      walmart ? parseSize(walmart.productName, "Walmart") : null
    );

    const amazonRaw: AmazonRaw = amazon ?? { ...EMPTY_AMAZON_RAW, productName: item.name };
    return {
      ...item,
      amazon: toAmazonStoreResult(amazonRaw, sizeMismatch),
      walmart: walmart ?? { price: null, productName: item.name },
      samsclub: { price: null, productName: item.name },
      sizeMismatch,
    };
  }

  const encoder = new TextEncoder();
  const pricedItems: (PricedItem | null)[] = new Array(items.length).fill(null);

  const stream = new ReadableStream({
    async start(controller) {
      await Promise.all(
        items.map(async (item, index) => {
          const result = await processItem(item);
          pricedItems[index] = result;
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "item", index, data: result }) + "\n")
          );
        })
      );

      const round = (n: number) => Math.round(n * 100) / 100;
      const filled = pricedItems as PricedItem[];
      const amazonTotal = round(filled.reduce((s, i) => s + (i.amazon.price ?? 0), 0));
      const walmartTotal = round(filled.reduce((s, i) => s + (i.walmart.price ?? 0), 0));
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "totals", amazonTotal, walmartTotal, samsclubTotal: 0 }) + "\n")
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
