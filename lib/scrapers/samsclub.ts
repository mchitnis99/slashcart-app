export type SamsClubResult = {
  name: string;
  price: number;
  inStock: boolean;
};

export async function scrapeSamsClubPrice(_itemName: string): Promise<SamsClubResult | null> {
  return null;
}
