"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type GroceryItem = { name: string; quantity: number; unit: string };
type StoreResult = { price: number | null; productName: string };
type PricedItem = GroceryItem & { amazon: StoreResult; walmart: StoreResult; costco: StoreResult };
type PriceData = { items: PricedItem[]; amazonTotal: number; walmartTotal: number; costcoTotal: number };

export default function ResultsPage() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludedItems, setExcludedItems] = useState<GroceryItem[]>([]);
  const [paidPrices, setPaidPrices] = useState<Record<number, string>>({});

  useEffect(() => {
    const excluded = sessionStorage.getItem("slashcart_excluded");
    if (excluded) {
      try { setExcludedItems(JSON.parse(excluded)); } catch {}
    }

    const raw = sessionStorage.getItem("slashcart_items");
    if (!raw) {
      setError("No grocery list found. Please go back and try again.");
      setLoading(false);
      return;
    }

    const items: GroceryItem[] = JSON.parse(raw);
    const zipCode = sessionStorage.getItem("slashcart_zipcode") ?? undefined;

    fetch("/api/search-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, zipCode }),
    })
      .then((r) => r.json())
      .then((data) => { setPriceData(data); setLoading(false); })
      .catch(() => { setError("Failed to load prices. Please try again."); setLoading(false); });
  }, []);

  if (loading) return <LoadingState />;
  if (error || !priceData) return <ErrorState message={error ?? "Unknown error."} />;

  const { items, amazonTotal, walmartTotal, costcoTotal } = priceData;

  const allStoreTotals = [
    { store: "Amazon",  total: amazonTotal  },
    { store: "Walmart", total: walmartTotal },
    { store: "Costco",  total: costcoTotal  },
  ].filter((s) => s.total > 0);

  const cheapestStore = allStoreTotals.length > 0
    ? allStoreTotals.reduce((a, b) => (a.total < b.total ? a : b)).store
    : null;
  const priciest = allStoreTotals.length > 1
    ? allStoreTotals.reduce((a, b) => (a.total > b.total ? a : b))
    : null;
  const storeSavings = cheapestStore && priciest
    ? priciest.total - allStoreTotals.find((s) => s.store === cheapestStore)!.total
    : 0;

  const totalSavings = items.reduce((sum, item, i) => {
    const bestPrice = Math.min(
      item.amazon.price ?? Infinity,
      item.walmart.price ?? Infinity,
      item.costco.price ?? Infinity
    );
    const paid = parseFloat(paidPrices[i] ?? "");
    return bestPrice < Infinity && !isNaN(paid) && paid > bestPrice
      ? sum + (paid - bestPrice)
      : sum;
  }, 0);

  const excludedPreview =
    excludedItems.slice(0, 3).map((i) => i.name).join(", ") +
    (excludedItems.length > 3 ? ", etc." : "");

  return (
    <main className="flex flex-col flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-[#22c55e] text-sm hover:underline mb-3 inline-block">
          ← New search
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#e2e8f0]">Price Comparison</h1>
        <p className="text-[#94a3b8] text-sm mt-1">
          {items.length} pantry staple{items.length !== 1 ? "s" : ""} · Amazon vs Walmart
        </p>
      </div>

      {/* Excluded fresh items note */}
      {excludedItems.length > 0 && (
        <p className="text-[#475569] text-sm mb-5 px-1">
          Showing pantry staples only. Fresh items ({excludedPreview}) are not included.
        </p>
      )}

      {/* Store savings banner */}
      {cheapestStore && priciest && storeSavings > 0.01 && (
        <div className="mb-6 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-5 py-4">
          <p className="text-[#e2e8f0] font-semibold text-sm sm:text-base">
            <span className="text-[#22c55e]">{cheapestStore}</span> is cheapest — save{" "}
            <span className="text-[#22c55e] font-bold">${storeSavings.toFixed(2)}</span>{" "}
            vs {priciest.store}
          </p>
          <p className="text-[#94a3b8] text-xs mt-1">
            {allStoreTotals.map((s) => `${s.store}: $${s.total.toFixed(2)}`).join(" · ")}
          </p>
        </div>
      )}

      {/* Item list */}
      <div className="space-y-3 mb-8">
        {items.map((item, i) => {
          const prices = [item.amazon.price, item.walmart.price, item.costco.price].filter(
            (p): p is number => p !== null
          );
          const minPrice = prices.length > 0 ? Math.min(...prices) : null;
          const amazonCheapest = minPrice !== null && item.amazon.price === minPrice;
          const walmartCheapest = minPrice !== null && item.walmart.price === minPrice;
          const costcoCheapest = minPrice !== null && item.costco.price === minPrice;

          const bestPrice = Math.min(
            item.amazon.price ?? Infinity,
            item.walmart.price ?? Infinity,
            item.costco.price ?? Infinity
          );
          const paid = parseFloat(paidPrices[i] ?? "");
          const itemSavings =
            bestPrice < Infinity && !isNaN(paid) && paid > bestPrice
              ? paid - bestPrice
              : null;

          const hasSomePrice =
            item.amazon.price !== null || item.walmart.price !== null || item.costco.price !== null;

          return (
            <div key={i} className="rounded-xl border border-[#1e3050] bg-[#0d1830] px-4 py-4">
              {/* Item name */}
              <div className="mb-3">
                <p className="font-medium text-[#e2e8f0] capitalize">{item.name}</p>
                <p className="text-[#475569] text-xs">{item.quantity} {item.unit}</p>
              </div>

              {/* Three-column store prices */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      label: "Amazon",
                      result: item.amazon,
                      cheapest: amazonCheapest,
                      buyUrl: `https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`,
                    },
                    {
                      label: "Walmart",
                      result: item.walmart,
                      cheapest: walmartCheapest,
                      buyUrl: `https://www.walmart.com/search?q=${encodeURIComponent(item.name)}`,
                    },
                    {
                      label: "Costco",
                      result: item.costco,
                      cheapest: costcoCheapest,
                      buyUrl: `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(item.name)}`,
                    },
                  ] as const
                ).map(({ label, result, cheapest, buyUrl }) => (
                  <div
                    key={label}
                    className={`rounded-lg p-2.5 border ${
                      cheapest
                        ? "border-[#22c55e]/40 bg-[#22c55e]/5"
                        : "border-[#1e3050] bg-[#142036]"
                    }`}
                  >
                    <p className="text-[#64748b] text-xs font-medium mb-1">{label}</p>
                    {result.price !== null ? (
                      <>
                        <p className={`font-bold text-base leading-none mb-1 ${cheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                          ${result.price.toFixed(2)}
                          {cheapest && <span className="text-[10px] ml-0.5">✓</span>}
                        </p>
                        {result.productName !== item.name && (
                          <p className="text-[#475569] text-[10px] truncate mb-1" title={result.productName}>
                            {result.productName}
                          </p>
                        )}
                        <a
                          href={buyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#22c55e] hover:text-[#16a34a] text-xs transition-colors"
                        >
                          Buy →
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="text-[#475569] text-xs mb-1">Unavailable</p>
                        <a
                          href={buyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#475569] hover:text-[#64748b] text-xs transition-colors"
                        >
                          Search →
                        </a>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* What did you pay? */}
              {hasSomePrice && (
                <div className="mt-3 pt-3 border-t border-[#1e3050] flex items-center gap-3">
                  <label className="text-[#475569] text-xs whitespace-nowrap">
                    What did you pay?
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#475569] text-xs pointer-events-none">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={paidPrices[i] ?? ""}
                      onChange={(e) =>
                        setPaidPrices((prev) => ({ ...prev, [i]: e.target.value }))
                      }
                      className="w-24 pl-5 pr-2 py-1.5 rounded-lg bg-[#142036] border border-[#1e3050] text-[#e2e8f0] text-xs focus:outline-none focus:ring-1 focus:ring-[#22c55e] transition"
                    />
                  </div>
                  {itemSavings !== null && (
                    <span className="text-[#22c55e] text-xs font-medium">
                      Save ${itemSavings.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { store: "Amazon",  total: amazonTotal  },
          { store: "Walmart", total: walmartTotal },
          { store: "Costco",  total: costcoTotal  },
        ].map(({ store, total }) => {
          const isCheapest = store === cheapestStore && storeSavings > 0.01;
          return (
            <div
              key={store}
              className={`rounded-xl border px-3 py-3 ${
                isCheapest
                  ? "border-[#22c55e]/40 bg-[#22c55e]/5"
                  : "border-[#1e3050] bg-[#142036]"
              }`}
            >
              <p className={`text-xs font-medium mb-1 ${isCheapest ? "text-[#22c55e]" : "text-[#94a3b8]"}`}>
                {store}{isCheapest && " ✓"}
              </p>
              <p className={`font-bold text-lg ${isCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                {total > 0 ? `$${total.toFixed(2)}` : "—"}
              </p>
            </div>
          );
        })}
      </div>

      {/* "What you paid" savings */}
      {totalSavings > 0 && (
        <div className="rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-4 py-4 flex items-center justify-between">
          <span className="text-[#22c55e] font-medium text-sm">
            Estimated savings vs. what you paid
          </span>
          <span className="text-[#22c55e] font-bold text-xl">
            ${totalSavings.toFixed(2)}
          </span>
        </div>
      )}

      <p className="text-[#475569] text-xs text-center mt-6">
        Prices are estimates and may vary. Check store apps for real-time accuracy.
      </p>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center gap-4 px-4">
      <div className="text-4xl animate-bounce">🛒</div>
      <p className="text-[#e2e8f0] font-semibold text-lg">Comparing prices on Amazon & Walmart…</p>
      <p className="text-[#94a3b8] text-sm">This may take a moment</p>
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
