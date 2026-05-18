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

// Exact zip overrides — checked first before prefix inference
const ZIP_STORE_MAP: Record<string, string[]> = {
  // Major urban — all stores
  "10001": ["Walmart", "Whole Foods", "Target", "Instacart", "Kroger"], // NYC Midtown
  "10011": ["Walmart", "Whole Foods", "Target", "Instacart", "Kroger"], // NYC Chelsea
  "90210": ["Walmart", "Whole Foods", "Target", "Instacart"],            // Beverly Hills
  "90028": ["Walmart", "Whole Foods", "Target", "Instacart"],            // Hollywood
  "60601": ["Walmart", "Whole Foods", "Target", "Instacart", "Kroger"], // Chicago Loop
  "98101": ["Walmart", "Whole Foods", "Target", "Instacart"],            // Seattle
  "02101": ["Walmart", "Whole Foods", "Target", "Instacart"],            // Boston
  "30301": ["Walmart", "Whole Foods", "Target", "Instacart", "Kroger"], // Atlanta
  "78701": ["Walmart", "Whole Foods", "Target", "Instacart", "Kroger"], // Austin
  "94102": ["Walmart", "Whole Foods", "Target", "Instacart"],            // San Francisco
  "20001": ["Walmart", "Whole Foods", "Target", "Instacart"],            // Washington DC
  // Suburban — no Whole Foods
  "30340": ["Walmart", "Target", "Instacart", "Kroger"],  // Suburban Atlanta
  "77001": ["Walmart", "Target", "Instacart", "Kroger"],  // Houston
  "85001": ["Walmart", "Target", "Instacart"],            // Phoenix
  "63101": ["Walmart", "Target", "Instacart", "Kroger"],  // St. Louis
  "44101": ["Walmart", "Target", "Instacart", "Kroger"],  // Cleveland
  // Small towns — Walmart + maybe Target/Kroger, no Whole Foods or Instacart
  "12508": ["Walmart", "Target", "Kroger"],  // Beacon, NY
  "82001": ["Walmart", "Target"],            // Cheyenne, WY
  "38501": ["Walmart", "Kroger"],            // Cookeville, TN
  "49601": ["Walmart"],                      // Cadillac, MI
  // Rural — Walmart only
  "59001": ["Walmart"],  // Absarokee, MT
  "59725": ["Walmart"],  // Dillon, MT
  "57001": ["Walmart"],  // rural South Dakota
  "83201": ["Walmart"],  // Pocatello, ID
};

// 3-digit prefixes for major metro areas (Whole Foods + Instacart present)
const URBAN_PREFIXES = new Set([
  "100","101","102","103","104",        // NYC Manhattan
  "112","113","114","116",              // Brooklyn, Queens, Bronx, Staten Island
  "606","607",                          // Chicago
  "900","901","902","903","904","905",  // LA metro
  "940","941","942","943","944","945",  // SF Bay Area + East Bay
  "980","981","982",                    // Seattle/Bellevue
  "021","022","024",                    // Boston metro
  "303","304",                          // Atlanta
  "787",                                // Austin
  "200","201","202","203","204",        // DC metro
  "191","192","193","194","195",        // Philadelphia
  "481","482","483",                    // Detroit metro
  "770","772",                          // Houston core
  "850","851","852",                    // Phoenix metro
  "802","803","804",                    // Denver
  "971","972","973",                    // Portland, OR
  "372","373",                          // Nashville
  "331","332","333",                    // Miami
]);

// 3-digit prefixes for sparse/rural areas (Walmart only or Walmart + Kroger)
const RURAL_PREFIXES = new Set([
  "590","591","592","593","594","595","596","597","598","599",  // Montana
  "570","571","572","573","574","575","576","577",               // South Dakota
  "580","581","582","583","584","585","586","587","588",         // North Dakota
  "820","821","822","823","824","825","826","827","828","829",   // Wyoming
  "832","833","834","835","836","837",                           // Rural Idaho
  "875","877","878","879","880","881",                           // Rural New Mexico
  "693","694","695","696","697","698","699",                     // Nebraska panhandle
  "247","248","249",                                             // Rural West Virginia
]);

function getStoresForZip(zip: string): string[] | null {
  if (!zip || zip.length < 5) return null;

  // Exact match first
  if (ZIP_STORE_MAP[zip]) return ZIP_STORE_MAP[zip];

  const prefix = zip.slice(0, 3);
  if (URBAN_PREFIXES.has(prefix)) {
    return ["Walmart", "Whole Foods", "Target", "Instacart", "Kroger"];
  }
  if (RURAL_PREFIXES.has(prefix)) {
    return ["Walmart", "Kroger"];
  }
  // Suburban default: Walmart + Target + Kroger, no Whole Foods (rare outside major metros)
  return ["Walmart", "Target", "Kroger"];
}

export default function ResultsPage() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipCode, setZipCode] = useState<string>("");

  useEffect(() => {
    const savedZip = sessionStorage.getItem("slashcart_zipcode") ?? "";
    setZipCode(savedZip);

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

  const allowedStores = getStoresForZip(zipCode);
  const { items, totals } = priceData;
  const stores = allowedStores
    ? priceData.stores.filter((s) => allowedStores.includes(s))
    : priceData.stores;

  const validTotals = Object.entries(totals).filter(
    (e): e is [string, number] => e[1] !== null && stores.includes(e[0])
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <p className="text-[#94a3b8] text-sm">
            {items.length} item{items.length !== 1 ? "s" : ""} compared across{" "}
            {stores.length} store{stores.length !== 1 ? "s" : ""}
          </p>
          {zipCode && (
            <p className="text-[#94a3b8] text-sm">
              ·{" "}
              <span className="text-[#e2e8f0]">{zipCode}</span>
              {" "}
              <Link href="/" className="text-[#22c55e] hover:underline text-xs">
                change
              </Link>
            </p>
          )}
        </div>
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
