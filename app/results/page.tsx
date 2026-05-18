"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type GroceryItem = { name: string; quantity: number; unit: string };
type PricedItem = GroceryItem & { amazonPrice: number | null; productName: string };
type PriceData = { items: PricedItem[]; total: number };

export default function ResultsPage() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludedItems, setExcludedItems] = useState<GroceryItem[]>([]);

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

  const { items, total } = priceData;

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
        <h1 className="text-2xl sm:text-3xl font-bold text-[#e2e8f0]">Amazon Prices</h1>
        <p className="text-[#94a3b8] text-sm mt-1">
          {items.length} pantry staple{items.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Excluded fresh items note */}
      {excludedItems.length > 0 && (
        <p className="text-[#475569] text-sm mb-6 px-1">
          Showing pantry staples only. Fresh items ({excludedPreview}) are not included in price
          comparison.
        </p>
      )}

      {/* Item list */}
      <div className="space-y-3 mb-8">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#1e3050] bg-[#0d1830] px-4 py-4 flex items-start justify-between gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[#e2e8f0] capitalize">{item.name}</p>
              <p className="text-[#475569] text-xs mt-0.5">
                {item.quantity} {item.unit}
              </p>
              {item.productName && item.productName !== item.name && (
                <p className="text-[#64748b] text-xs mt-1 truncate" title={item.productName}>
                  {item.productName}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {item.amazonPrice !== null ? (
                <>
                  <span className="text-[#e2e8f0] font-semibold text-base">
                    ${item.amazonPrice.toFixed(2)}
                  </span>
                  <a
                    href={`https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#22c55e] hover:text-[#16a34a] text-xs font-medium whitespace-nowrap transition-colors"
                  >
                    Buy on Amazon →
                  </a>
                </>
              ) : (
                <>
                  <span className="text-[#475569] text-sm">Price unavailable</span>
                  <a
                    href={`https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#64748b] hover:text-[#94a3b8] text-xs font-medium whitespace-nowrap transition-colors"
                  >
                    Search on Amazon →
                  </a>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      {(() => {
        const pricedCount = items.filter((i) => i.amazonPrice !== null).length;
        return (
          <div className="rounded-xl border border-[#1e3050] bg-[#142036] px-4 py-4 flex items-center justify-between">
            <div>
              <span className="font-semibold text-[#e2e8f0]">Estimated total</span>
              {pricedCount < items.length && (
                <p className="text-[#475569] text-xs mt-0.5">
                  {pricedCount} of {items.length} items priced
                </p>
              )}
            </div>
            <span className="text-[#22c55e] font-bold text-xl">${total.toFixed(2)}</span>
          </div>
        );
      })()}

      <p className="text-[#475569] text-xs text-center mt-6">
        Prices are estimates and may vary. Check Amazon for real-time accuracy.
      </p>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center gap-4 px-4">
      <div className="text-4xl animate-bounce">🛒</div>
      <p className="text-[#e2e8f0] font-semibold text-lg">Finding best prices on Amazon…</p>
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
