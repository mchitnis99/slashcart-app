import {
  isRelevant,
  isSpecialty,
  extractBrands,
  passesBrandCheck,
  passesNegativeKeywords,
  getCategoryMinPrice,
  passesVariantCheck,
} from "@/lib/scrapers/filters";

export type WalmartResult = {
  name: string;
  price: number;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
};

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 && raw < 10000 ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return !isNaN(n) && n > 0 && n < 10000 ? n : null;
  }
  return null;
}

export async function scrapeWalmartPrice(itemName: string, pricePaid?: number): Promise<WalmartResult | null> {
  const apiKey = process.env.SCRAPERAPI_KEY ?? "";
  const url =
    `https://api.scraperapi.com/structured/walmart/search` +
    `?api_key=${apiKey}&query=${encodeURIComponent(itemName)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error(`[walmart] Network error for "${itemName}":`, err);
    return null;
  }

  console.log(`[walmart] Status: ${response.status} for "${itemName}"`);
  if (!response.ok) {
    console.error(`[walmart] Error: ${response.status} ${response.statusText}`);
    return null;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    console.error(`[walmart] Failed to parse JSON for "${itemName}":`, err);
    return null;
  }

  const data = json as Record<string, unknown>;
  const results = (data.results ?? data.organic_results ?? data.items ?? []) as Record<string, unknown>[];

  console.log(`[walmart] Got ${results.length} results for "${itemName}" (pricePaid=${pricePaid ?? "none"})`);

  const brands = extractBrands(itemName);
  const hasBrand = brands.length > 0;
  const categoryMin = getCategoryMinPrice(itemName);

  type Candidate = { name: string; price: number; url: string | null; imageUrl: string | null };
  const standard: Candidate[] = [];
  const specialty: Candidate[] = [];
  const noBrand: Candidate[] = [];
  const tooBig: Candidate[] = [];
  const tooSmall: Candidate[] = [];

  for (const result of results) {
    const name = String(result.name ?? result.title ?? itemName);
    // Log all price fields so we can identify which one ScraperAPI populates
    if (result.price !== undefined || result.sale_price !== undefined || result.primary_price !== undefined || result.unit_price !== undefined) {
      console.log(`[walmart] price fields for "${name}": price=${result.price ?? "—"} sale_price=${result.sale_price ?? "—"} primary_price=${result.primary_price ?? "—"} unit_price=${result.unit_price ?? "—"}`);
    }
    // Prefer primary_price (shelf price) over price (may be unit/per-item price on some results)
    const price = parsePrice(result.primary_price ?? result.price ?? result.sale_price);
    const resultUrl = (typeof result.url === "string" && result.url) ? result.url
                    : (typeof result.link === "string" && result.link) ? result.link
                    : null;
    const resultImageUrl = (typeof result.image === "string" && result.image) ? result.image
                         : (typeof result.thumbnail === "string" && result.thumbnail) ? result.thumbnail
                         : null;

    if (!isRelevant(name, itemName, "walmart")) continue;
    if (price === null) continue;

    if (!passesNegativeKeywords(name, itemName, "walmart")) continue;

    // Sanity check: if price is < 50% of what the user paid, it's likely a travel/mini size
    if (pricePaid && price < pricePaid * 0.50) {
      console.log(`[walmart] [TOO-SMALL] "${name}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooSmall.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
      continue;
    }

    // Category price floor: catches travel sizes even without pricePaid
    if (categoryMin !== null && price < categoryMin) {
      console.log(`[walmart] [TOO-SMALL] "${name}" @ $${price} (category floor $${categoryMin}) (query: "${itemName}")`);
      tooSmall.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
      continue;
    }

    // Sanity check: if price is > 200% of what the user paid, it's likely a multi-pack or bulk
    if (pricePaid && price > pricePaid * 2.00) {
      console.log(`[walmart] [TOO-BIG] "${name}" @ $${price} (pricePaid=$${pricePaid}, ${Math.round(price/pricePaid*100)}% of paid) (query: "${itemName}")`);
      tooBig.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
      continue;
    }

    // Fix 1: variant check (same as Amazon)
    const variantConflict = passesVariantCheck(name, itemName);
    if (variantConflict !== null) {
      console.log(`[walmart] VARIANT-SKIP: expected "${variantConflict.expectedVariant}", got "${variantConflict.foundVariant}" in "${name}" (query: "${itemName}")`);
      continue;
    }

    // Fix 2: hard-reject brand mismatches for branded queries
    const brandOk = passesBrandCheck(name, brands);
    if (!brandOk) {
      if (hasBrand) {
        const inferredBrand = name.split(/\s+/).slice(0, 3).join(" ");
        console.log(`[walmart] BRAND-HARD-REJECT: expected "${brands.join("/")}", got "${inferredBrand}" (query: "${itemName}")`);
        continue;
      } else {
        noBrand.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
        continue;
      }
    }

    const special = isSpecialty(name, itemName);
    console.log(`[walmart] [${special ? "SPECIALTY" : "PASS"}] "${name}" @ $${price} (query: "${itemName}")`);
    if (special) specialty.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
    else         standard.push({ name, price, url: resultUrl, imageUrl: resultImageUrl });
  }

  // Pick cheapest: standard → specialty → noBrand → tooBig → tooSmall
  const pool = standard.length > 0 ? standard
    : specialty.length > 0 ? specialty
    : noBrand.length > 0 ? noBrand
    : tooBig.length > 0 ? tooBig
    : tooSmall;
  if (pool.length === 0) {
    console.error(`[walmart] No relevant priced results for "${itemName}". Response:`, JSON.stringify(data).slice(0, 500));
    return null;
  }

  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  console.log(`[walmart] Selected: "${best.name}" @ $${best.price} (from ${standard.length} standard, ${specialty.length} specialty, ${noBrand.length} no-brand, ${tooBig.length} too-big, ${tooSmall.length} too-small)`);

  if (!best.imageUrl) {
    const bestRaw = results.find((r) => String(r.name ?? r.title ?? itemName) === best.name);
    if (bestRaw) {
      console.log(`[scraper] available image fields for "${best.name}":`, JSON.stringify({
        image: bestRaw.image,
        thumbnail: bestRaw.thumbnail,
        img: bestRaw.img,
        photo: bestRaw.photo,
        picture: bestRaw.picture,
      }));
    }
  }
  return { name: best.name, price: best.price, inStock: true, url: best.url, imageUrl: best.imageUrl };
}
