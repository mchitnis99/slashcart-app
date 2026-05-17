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

const STORE_URLS: Record<string, string> = {
  Walmart: "https://www.walmart.com/grocery",
  "Whole Foods": "https://www.wholefoodsmarket.com",
  Target: "https://www.target.com/c/grocery/-/N-5xt1a",
  Instacart: "https://www.instacart.com",
  Kroger: "https://www.kroger.com",
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

  const validTotals = Object.entries(totals).filter(
    (e): e is [string, number] => e[1] !== null
  );

  const cheapestStore =
    validTotals.length > 0
      ? validTotals.reduce((a, b) => (a[1] < b[1] ? a : b))[0]
      : null;

  const mostExpensiveStore =
    validTotals.length > 1
      ? validTotals.reduce((a, b) => (a[1] > b[1] ? a : b))[0]
      : null;

  const savings =
    cheapestStore && mostExpensiveStore
      ? (totals[mostExpensiveStore] as number) - (totals[cheapestStore] as number)
      : null;

  return (
    <main className="flex flex-col flex-1 px-4 py-10 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/"
          className="text-[#22c55e] text-sm hover:underline mb-3 inline-block"
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

      {/* Savings summary bar */}
      {savings !== null && savings > 0 && cheapestStore && mostExpensiveStore && (
        <div className="mb-6 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💚</span>
            <div>
              <p className="text-[#e2e8f0] font-semibold text-sm sm:text-base">
                Shop at{" "}
                <span className="text-[#22c55e]">{cheapestStore}</span> and save{" "}
                <span className="text-[#22c55e] font-bold">
                  ${savings.toFixed(2)}
                </span>{" "}
                vs {mostExpensiveStore}
              </p>
              <p className="text-[#94a3b8] text-xs mt-0.5">
                {cheapestStore}: ${(totals[cheapestStore] as number).toFixed(2)}{" "}
                &nbsp;·&nbsp; {mostExpensiveStore}:{" "}
                ${(totals[mostExpensiveStore] as number).toFixed(2)}
              </p>
            </div>
          </div>
          <a
            href={STORE_URLS[cheapestStore]}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 bg-[#22c55e] hover:bg-[#16a34a] text-[#0b1426] font-semibold text-sm px-4 py-2 rounded-lg transition-colors text-center"
          >
            Shop at {cheapestStore} →
          </a>
        </div>
      )}

      {/* Scrollable comparison table */}
      <div className="rounded-2xl border border-[#1e3050] overflow-hidden overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-[#142036]">
              <th className="text-left text-[#94a3b8] font-medium px-4 py-3 sticky left-0 bg-[#142036] z-10">
                Item
              </th>
              {stores.map((store) => {
                const isBest = store === cheapestStore;
                return (
                  <th
                    key={store}
                    className={`text-center font-medium px-4 py-3 whitespace-nowrap ${
                      isBest ? "text-[#22c55e]" : "text-[#94a3b8]"
                    }`}
                  >
                    {store}
                    {isBest && <span className="ml-1 text-xs">★</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
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
                  <td
                    className={`px-4 py-3 sticky left-0 z-10 ${
                      i % 2 === 0 ? "bg-[#0b1426]" : "bg-[#0d1830]"
                    }`}
                  >
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
                          <span className="text-[#475569] text-xs">Out of stock</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              isCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"
                            }`}
                          >
                            ${price.toFixed(2)}
                            {isCheapest && (
                              <span className="ml-0.5 text-[10px]"> ✓</span>
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

            {/* Shop Now row — button only for cheapest store */}
            <tr className="border-t border-[#1e3050] bg-[#0f1c30]">
              <td className="px-4 py-3 sticky left-0 bg-[#0f1c30] text-[#475569] text-xs">
                Shop
              </td>
              {stores.map((store) => {
                const isBest = store === cheapestStore;
                return (
                  <td key={store} className="text-center px-4 py-2">
                    {isBest ? (
                      <a
                        href={STORE_URLS[store]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-[#22c55e] hover:bg-[#16a34a] text-[#0b1426] font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Shop at {store} →
                      </a>
                    ) : (
                      <a
                        href={STORE_URLS[store]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-[#475569] hover:text-[#94a3b8] text-xs px-3 py-1.5 rounded-lg border border-[#1e3050] hover:border-[#2a4060] transition-colors whitespace-nowrap"
                      >
                        {store} →
                      </a>
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

const LOADING_STEPS = [
  { store: "Walmart", icon: "🔵" },
  { store: "Whole Foods", icon: "🟢" },
  { store: "Target", icon: "🔴" },
  { store: "Instacart", icon: "🟠" },
  { store: "Kroger", icon: "🟣" },
];

function LoadingState() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<boolean[]>(Array(LOADING_STEPS.length).fill(false));

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => {
        const next = s + 1;
        if (next >= LOADING_STEPS.length) {
          clearInterval(interval);
          return s;
        }
        setDone((d) => {
          const copy = [...d];
          copy[s] = true;
          return copy;
        });
        return next;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const current = LOADING_STEPS[step];

  return (
    <main className="flex flex-col flex-1 items-center justify-center gap-8 px-4">
      <div className="text-center space-y-2">
        <div className="text-3xl animate-bounce">{current.icon}</div>
        <p className="text-[#e2e8f0] font-semibold text-lg">
          Checking {current.store} prices…
        </p>
        <p className="text-[#94a3b8] text-sm">Finding the best deals for you</p>
      </div>

      <div className="flex items-center gap-3">
        {LOADING_STEPS.map(({ store, icon }, i) => (
          <div
            key={store}
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${
              i < step
                ? "opacity-100"
                : i === step
                ? "opacity-100 scale-110"
                : "opacity-25"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-colors duration-300 ${
                done[i]
                  ? "border-[#22c55e] bg-[#22c55e]/10"
                  : i === step
                  ? "border-[#22c55e] bg-[#142036] animate-pulse"
                  : "border-[#1e3050] bg-[#142036]"
              }`}
            >
              {done[i] ? (
                <span className="text-[#22c55e] text-xs font-bold">✓</span>
              ) : (
                <span>{icon}</span>
              )}
            </div>
            <span className="text-[10px] text-[#475569] whitespace-nowrap hidden sm:block">
              {store}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-48 h-1 rounded-full bg-[#1e3050] overflow-hidden">
        <div
          className="h-full bg-[#22c55e] rounded-full transition-all duration-500"
          style={{ width: `${((step + 1) / LOADING_STEPS.length) * 100}%` }}
        />
      </div>
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
