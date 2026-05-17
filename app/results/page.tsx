"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type GroceryItem = { name: string; quantity: number; unit: string };
type StorePrice = { price: number | null; inStock: boolean };
type PricedItem = GroceryItem & { prices: Record<string, StorePrice> };
type PriceData = {
  items: PricedItem[];
  stores: string[];
  totals: Record<string, number | null>;
};

export default function ResultsPage() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("slashcart_items");
    if (!raw) {
      setError("No grocery list found. Please go back and try again.");
      setLoading(false);
      return;
    }

    const items: GroceryItem[] = JSON.parse(raw);

    fetch("/api/search-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => r.json())
      .then((data) => {
        setPriceData(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load prices. Please try again.");
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingState />;
  if (error || !priceData) return <ErrorState message={error ?? "Unknown error."} />;

  const { items, stores, totals } = priceData;

  // Find cheapest store by total
  const validTotals = Object.entries(totals).filter(([, v]) => v !== null) as [
    string,
    number,
  ][];
  const cheapestStore =
    validTotals.length > 0
      ? validTotals.reduce((a, b) => (a[1] < b[1] ? a : b))[0]
      : null;

  return (
    <main className="flex flex-col flex-1 px-4 py-10 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <Link
            href="/"
            className="text-[#22c55e] text-sm hover:underline mb-2 inline-block"
          >
            ← New search
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#e2e8f0]">
            Price Comparison
          </h1>
          <p className="text-[#94a3b8] text-sm mt-1">
            {items.length} item{items.length !== 1 ? "s" : ""} compared across{" "}
            {stores.length} stores
          </p>
        </div>

        {cheapestStore && (
          <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-xl px-4 py-3 text-center">
            <div className="text-[#22c55e] font-semibold text-sm">Best value</div>
            <div className="text-[#e2e8f0] font-bold text-xl">{cheapestStore}</div>
            <div className="text-[#22c55e] text-sm font-medium">
              ${totals[cheapestStore]?.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable table */}
      <div className="rounded-2xl border border-[#1e3050] overflow-hidden overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-[#142036]">
              <th className="text-left text-[#94a3b8] font-medium px-4 py-3 sticky left-0 bg-[#142036] z-10">
                Item
              </th>
              {stores.map((store) => (
                <th
                  key={store}
                  className={`text-center font-medium px-4 py-3 whitespace-nowrap ${
                    store === cheapestStore
                      ? "text-[#22c55e]"
                      : "text-[#94a3b8]"
                  }`}
                >
                  {store}
                  {store === cheapestStore && (
                    <span className="ml-1 text-xs">★</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              // Find lowest price for this row
              const rowPrices = stores
                .map((s) => item.prices[s].price)
                .filter((p): p is number => p !== null);
              const minPrice = rowPrices.length > 0 ? Math.min(...rowPrices) : null;

              return (
                <tr
                  key={i}
                  className={`border-t border-[#1e3050] ${
                    i % 2 === 0 ? "bg-[#0b1426]" : "bg-[#0d1830]"
                  }`}
                >
                  <td className={`px-4 py-3 sticky left-0 z-10 ${i % 2 === 0 ? "bg-[#0b1426]" : "bg-[#0d1830]"}`}>
                    <div className="font-medium text-[#e2e8f0] capitalize">
                      {item.name}
                    </div>
                    <div className="text-[#475569] text-xs">
                      {item.quantity} {item.unit}
                    </div>
                  </td>
                  {stores.map((store) => {
                    const { price, inStock } = item.prices[store];
                    const isCheapest = price !== null && price === minPrice;

                    return (
                      <td key={store} className="text-center px-4 py-3">
                        {!inStock || price === null ? (
                          <span className="text-[#475569] text-xs">
                            Out of stock
                          </span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              isCheapest
                                ? "text-[#22c55e]"
                                : "text-[#e2e8f0]"
                            }`}
                          >
                            ${price.toFixed(2)}
                            {isCheapest && (
                              <span className="ml-1 text-[10px] text-[#22c55e]">
                                ✓
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Totals row */}
            <tr className="border-t-2 border-[#1e3050] bg-[#142036]">
              <td className="px-4 py-3 sticky left-0 bg-[#142036] font-semibold text-[#e2e8f0]">
                Total
              </td>
              {stores.map((store) => {
                const total = totals[store];
                const isBest = store === cheapestStore;
                return (
                  <td key={store} className="text-center px-4 py-3">
                    {total === null ? (
                      <span className="text-[#475569] text-xs">—</span>
                    ) : (
                      <span
                        className={`font-bold text-base ${
                          isBest ? "text-[#22c55e]" : "text-[#e2e8f0]"
                        }`}
                      >
                        ${total.toFixed(2)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[#475569] text-xs text-center mt-6">
        Prices are estimates and may vary. Check store apps for real-time accuracy.
      </p>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      <p className="text-[#94a3b8] text-sm">Comparing prices across stores…</p>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="flex flex-col flex-1 items-center justify-center gap-4 px-4">
      <p className="text-red-400 text-center">{message}</p>
      <Link
        href="/"
        className="text-[#22c55e] text-sm border border-[#22c55e]/30 rounded-lg px-4 py-2 hover:bg-[#22c55e]/10 transition"
      >
        ← Go back
      </Link>
    </main>
  );
}
