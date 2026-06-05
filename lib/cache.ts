import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Only raw scraped fields are cached — no derived values (e.g. annualSavings).
// Derived values are always recomputed at read time so logic changes take effect immediately.
type CachedPriceData = {
  amazon: {
    price: number | null;
    productName: string;
    asin: string | null;
    imageUrl?: string | null;
    regularPrice: number | null;
    bulkPrice: number | null;
    bulkQuantity: number | null;
    bulkAsin: string | null;
  } | null;
  walmart: {
    price: number | null;
    productName: string;
    url?: string | null;
    imageUrl?: string | null;
  } | null;
};

export async function getCachedPrice(searchTerm: string): Promise<CachedPriceData | null> {
  try {
    const { data, error } = await supabase
      .from("price_cache")
      .select("data, expires_at")
      .eq("search_term", searchTerm)
      .single();

    if (error || !data) return null;
    if (new Date(data.expires_at) <= new Date()) return null;

    return data.data as CachedPriceData;
  } catch {
    return null;
  }
}

export async function setCachedPrice(
  searchTerm: string,
  data: CachedPriceData
): Promise<boolean> {
  try {
    const now = Date.now();
    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const cachedAt = new Date(now).toISOString();
    const { error } = await supabase.from("price_cache").upsert(
      { search_term: searchTerm, data, expires_at: expiresAt, cached_at: cachedAt },
      { onConflict: "search_term" }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[cache] write error:", err);
    return false;
  }
}
