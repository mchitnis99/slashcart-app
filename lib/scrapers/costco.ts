export type CostcoResult = {
  name: string;
  price: number;
  inStock: boolean;
};

// Costco's site reliably defeats ScraperAPI even with premium proxies.
// Disabled until a working scrape strategy is found.
export async function scrapeCostcoPrice(_itemName: string): Promise<CostcoResult | null> {
  return null;
}
