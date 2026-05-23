import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CachedPriceData = {
  amazon: {
    price: number | null;
    productName: string;
    asin: string | null;
    regularPrice: number | null;
    bulkPrice: number | null;
    bulkQuantity: number | null;
    bulkAsin: string | null;
    annualSavings: number | null;
  } | null;
  walmart: {
    price: number | null;
    productName: string;
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
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("price_cache").upsert(
      { search_term: searchTerm, data, expires_at: expiresAt },
      { onConflict: "search_term" }
    );
  } catch {
    // Cache write failure is non-fatal
  }
}
