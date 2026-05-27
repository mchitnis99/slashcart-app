"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseSize, toComparableSize } from "@/lib/utils/parseSize";

type GroceryItem = { name: string; quantity: number; unit: string };
type StoreResult = { price: number | null; productName: string };
type AmazonStoreResult = StoreResult & {
  asin: string | null;
  regularPrice: number | null;
  bulkPrice: number | null;
  bulkQuantity: number | null;
  bulkAsin: string | null;
  annualSavings: number | null;
};
type PricedItem = GroceryItem & {
  amazon: AmazonStoreResult;
  walmart: StoreResult;
  samsclub: StoreResult;
  sizeMismatch: boolean;
};
type Totals = { amazonTotal: number; walmartTotal: number; samsclubTotal: number };

function getWinners(item: PricedItem): { amazonCheapest: boolean; walmartCheapest: boolean } {
  if (item.sizeMismatch) return { amazonCheapest: false, walmartCheapest: false };

  const amazonNorm = toComparableSize(item.amazon.productName ? parseSize(item.amazon.productName) : null);
  const walmartNorm = toComparableSize(item.walmart.productName ? parseSize(item.walmart.productName) : null);
  const amazonNormPPU = amazonNorm && item.amazon.price !== null ? item.amazon.price / amazonNorm.quantity : null;
  const walmartNormPPU = walmartNorm && item.walmart.price !== null ? item.walmart.price / walmartNorm.quantity : null;

  if (amazonNormPPU !== null && walmartNormPPU !== null && amazonNorm!.unit === walmartNorm!.unit) {
    return {
      amazonCheapest: amazonNormPPU <= walmartNormPPU,
      walmartCheapest: walmartNormPPU <= amazonNormPPU,
    };
  }

  const prices = [item.amazon.price, item.walmart.price].filter((p): p is number => p !== null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  return {
    amazonCheapest: minPrice !== null && item.amazon.price === minPrice,
    walmartCheapest: minPrice !== null && item.walmart.price === minPrice,
  };
}

function buildAmazonCartUrl(items: PricedItem[]): string | null {
  const asins = items
    .filter((item) => !item.sizeMismatch)
    .map((item) => item.amazon.bulkAsin ?? item.amazon.asin)
    .filter((asin): asin is string => typeof asin === "string" && asin.length > 0);
  if (asins.length === 0) return null;
  const params = asins
    .map((asin, i) => `ASIN.${i + 1}=${asin}&Quantity.${i + 1}=1`)
    .join("&");
  return `https://www.amazon.com/gp/aws/cart/add.html?${params}`;
}

function PricedItemCard({ item }: { item: PricedItem }) {
  const amazonUnit = item.amazon.productName ? parseSize(item.amazon.productName) : null;
  const walmartUnit = item.walmart.productName ? parseSize(item.walmart.productName) : null;

  const amazonPricePerUnit =
    amazonUnit && item.amazon.price !== null ? item.amazon.price / amazonUnit.quantity : null;
  const walmartPricePerUnit =
    walmartUnit && item.walmart.price !== null ? item.walmart.price / walmartUnit.quantity : null;

  const { amazonCheapest, walmartCheapest } = getWinners(item);

  const bulkPerUnit =
    item.amazon.bulkPrice !== null && item.amazon.bulkQuantity !== null
      ? item.amazon.bulkPrice / item.amazon.bulkQuantity
      : null;

  return (
    <div className="rounded-xl border border-[#1e3050] bg-[#0d1830] px-4 py-4">
      <div className="mb-3">
        <p className="font-medium text-[#e2e8f0] capitalize">{item.name}</p>
        <p className="text-[#475569] text-xs">{item.quantity} {item.unit}</p>
        {item.sizeMismatch && (
          <p className="text-[#f59e0b] text-[10px] mt-0.5">
            ⚠ Different sizes — prices not directly comparable
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-2.5 border ${amazonCheapest ? "border-[#22c55e]/40 bg-[#22c55e]/5" : "border-[#1e3050] bg-[#142036]"}`}>
          <p className="text-[#64748b] text-xs font-medium mb-1">Amazon</p>
          {item.amazon.price !== null ? (
            <>
              <p className={`font-bold text-base leading-none mb-1 ${amazonCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                ${(item.amazon.regularPrice ?? item.amazon.price).toFixed(2)}
                {amazonCheapest && <span className="text-[10px] ml-0.5">✓</span>}
              </p>
              {amazonUnit && (
                <p className="text-[#64748b] text-[11px] leading-none mb-0.5">
                  {amazonUnit.quantity} {amazonUnit.unit}
                </p>
              )}
              {!item.sizeMismatch && amazonPricePerUnit !== null && (
                <p className="text-[#475569] text-[10px] leading-none mb-1">
                  ${amazonPricePerUnit.toFixed(2)}/{amazonUnit!.unit}
                </p>
              )}
              {item.amazon.productName !== item.name && (
                <p className="text-[#475569] text-[10px] truncate mb-1" title={item.amazon.productName}>
                  {item.amazon.productName}
                </p>
              )}
              {!item.sizeMismatch && item.amazon.bulkPrice !== null && item.amazon.bulkQuantity !== null && bulkPerUnit !== null && (
                <div className="mt-1.5 mb-1 rounded bg-[#0d1830] px-2 py-1.5 border border-[#1e3050]">
                  <p className="text-[#94a3b8] text-[10px] leading-snug">
                    ${item.amazon.bulkPrice.toFixed(2)} for {item.amazon.bulkQuantity}-pack
                  </p>
                  <p className="text-[#94a3b8] text-[10px] leading-snug">
                    = <span className="text-[#e2e8f0] font-medium">${bulkPerUnit.toFixed(2)}/unit</span>
                  </p>
                </div>
              )}
              {amazonCheapest && item.amazon.annualSavings !== null && item.amazon.annualSavings > 0 && (
                <p className="text-[#22c55e] text-[10px] font-medium bg-[#22c55e]/10 rounded px-1.5 py-0.5 inline-block mb-1 mt-0.5">
                  Save ${item.amazon.annualSavings.toFixed(2)}/yr bulk
                </p>
              )}
              <div className="mt-1">
                <a
                  href={`https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#22c55e] hover:text-[#16a34a] text-xs transition-colors"
                >
                  Buy →
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="text-[#475569] text-xs mb-1">Unavailable</p>
              <a
                href={`https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#475569] hover:text-[#64748b] text-xs transition-colors"
              >
                Search →
              </a>
            </>
          )}
        </div>

        <div className={`rounded-lg p-2.5 border ${walmartCheapest ? "border-[#22c55e]/40 bg-[#22c55e]/5" : "border-[#1e3050] bg-[#142036]"}`}>
          <p className="text-[#64748b] text-xs font-medium mb-1">Walmart</p>
          {item.walmart.price !== null ? (
            <>
              <p className={`font-bold text-base leading-none mb-1 ${walmartCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                ${item.walmart.price.toFixed(2)}
                {walmartCheapest && <span className="text-[10px] ml-0.5">✓</span>}
              </p>
              {walmartUnit && (
                <p className="text-[#64748b] text-[11px] leading-none mb-0.5">
                  {walmartUnit.quantity} {walmartUnit.unit}
                </p>
              )}
              {!item.sizeMismatch && walmartPricePerUnit !== null && (
                <p className="text-[#475569] text-[10px] leading-none mb-1">
                  ${walmartPricePerUnit.toFixed(2)}/{walmartUnit!.unit}
                </p>
              )}
              {item.walmart.productName !== item.name && (
                <p className="text-[#475569] text-[10px] truncate mb-1" title={item.walmart.productName}>
                  {item.walmart.productName}
                </p>
              )}
              <a
                href={`https://www.walmart.com/search?q=${encodeURIComponent(item.name)}`}
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
                href={`https://www.walmart.com/search?q=${encodeURIComponent(item.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#475569] hover:text-[#64748b] text-xs transition-colors"
              >
                Search →
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ name, quantity, unit }: GroceryItem) {
  return (
    <div className="rounded-xl border border-[#1e3050] bg-[#0d1830] px-4 py-4 animate-pulse">
      <div className="mb-3">
        <p className="font-medium text-[#e2e8f0] capitalize">{name}</p>
        <p className="text-[#475569] text-xs">{quantity} {unit}</p>
        <p className="text-[#475569] text-xs mt-0.5">Searching Amazon & Walmart…</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {["Amazon", "Walmart"].map((store) => (
          <div key={store} className="rounded-lg p-2.5 border border-[#1e3050] bg-[#142036]">
            <p className="text-[#64748b] text-xs font-medium mb-2">{store}</p>
            <div className="h-5 rounded bg-[#1e3050] w-16 mb-2" />
            <div className="h-3 rounded bg-[#1e3050] w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludedItems, setExcludedItems] = useState<GroceryItem[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [pricedItems, setPricedItems] = useState<(PricedItem | null)[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    const controller = new AbortController();

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

    setGroceryItems(items);
    setPricedItems(new Array(items.length).fill(null));
    setLoading(false);

    fetch("/api/search-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, zipCode }),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok || !r.body) throw new Error("Failed to load prices.");
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line) as
              | { type: "item"; index: number; data: PricedItem }
              | { type: "totals"; amazonTotal: number; walmartTotal: number; samsclubTotal: number };
            if (msg.type === "item") {
              setPricedItems((prev) => {
                const next = [...prev];
                next[msg.index] = msg.data;
                return next;
              });
            } else if (msg.type === "totals") {
              setTotals({ amazonTotal: msg.amazonTotal, walmartTotal: msg.walmartTotal, samsclubTotal: msg.samsclubTotal });
            }
          }
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("Failed to load prices. Please try again.");
      });

    return () => controller.abort();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const allLoaded = totals !== null;
  const { amazonTotal, walmartTotal } = totals ?? { amazonTotal: 0, walmartTotal: 0 };

  const allStoreTotals = [
    { store: "Amazon",  total: amazonTotal  },
    { store: "Walmart", total: walmartTotal },
  ].filter((s) => s.total > 0);

  const cheapestStore = allStoreTotals.length > 0
    ? allStoreTotals.reduce((a, b) => (a.total < b.total ? a : b)).store
    : null;
  const storeSavings = allStoreTotals.length > 1
    ? allStoreTotals.reduce((a, b) => (a.total > b.total ? a : b)).total -
      allStoreTotals.find((s) => s.store === cheapestStore)!.total
    : 0;

  const totalAnnualSavings = allLoaded
    ? Math.round(
        (pricedItems as PricedItem[]).reduce(
          (sum, item) =>
            sum + (getWinners(item).amazonCheapest ? (item.amazon.annualSavings ?? 0) : 0),
          0
        ) * 100
      ) / 100
    : 0;

  const excludedPreview =
    excludedItems.slice(0, 3).map((i) => i.name).join(", ") +
    (excludedItems.length > 3 ? ", etc." : "");

  const amazonCartUrl = allLoaded ? buildAmazonCartUrl(pricedItems as PricedItem[]) : null;

  return (
    <main className="flex flex-col flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <Link href="/" className="text-[#22c55e] text-sm hover:underline mb-3 inline-block">
          ← New search
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#e2e8f0]">Price Comparison</h1>
        <p className="text-[#94a3b8] text-sm mt-1">
          {groceryItems.length} pantry staple{groceryItems.length !== 1 ? "s" : ""} · Amazon vs Walmart
        </p>
      </div>

      {excludedItems.length > 0 && (
        <p className="text-[#475569] text-sm mb-5 px-1">
          Showing pantry staples only. Fresh items ({excludedPreview}) are not included.
        </p>
      )}

      {allLoaded && totalAnnualSavings > 0 && (
        <div className="mb-6 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-5 py-4">
          <p className="text-[#e2e8f0] font-semibold text-sm sm:text-base">
            Buy in bulk and save{" "}
            <span className="text-[#22c55e] font-bold">${totalAnnualSavings.toFixed(2)}/year</span>
          </p>
          <p className="text-[#94a3b8] text-xs mt-1">
            Compared to buying single units monthly across all items
          </p>
        </div>
      )}

      {pricedItems.some((p) => p === null) && (
        <p className="text-[#94a3b8] text-sm text-center animate-pulse mb-4">
          Hang on, finding the best prices…
        </p>
      )}

      <div className="space-y-3 mb-8">
        {groceryItems.map((groceryItem, i) => {
          const priced = pricedItems[i];
          return priced
            ? <PricedItemCard key={i} item={priced} />
            : <SkeletonCard key={i} {...groceryItem} />;
        })}
      </div>

      {allLoaded && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              { store: "Amazon",  total: amazonTotal  },
              { store: "Walmart", total: walmartTotal },
            ].map(({ store, total }) => {
              const isCheapest = store === cheapestStore && storeSavings > 0.01;
              return (
                <div
                  key={store}
                  className={`rounded-xl border px-3 py-3 ${isCheapest ? "border-[#22c55e]/40 bg-[#22c55e]/5" : "border-[#1e3050] bg-[#142036]"}`}
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

          {totalAnnualSavings > 0 && (
            <div className="rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-4 py-4 flex items-center justify-between mb-4">
              <div>
                <span className="text-[#22c55e] font-semibold text-sm block">
                  Total annual savings buying in bulk
                </span>
                <span className="text-[#94a3b8] text-xs">vs. buying single units monthly</span>
              </div>
              <span className="text-[#22c55e] font-bold text-2xl">
                ${totalAnnualSavings.toFixed(2)}
              </span>
            </div>
          )}

          {amazonCartUrl && (
            <a
              href={amazonCartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-base px-6 py-4 transition-colors mb-6"
            >
              Add all to Amazon cart →
            </a>
          )}
        </>
      )}

      <p className="text-[#475569] text-xs text-center mt-2">
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
