"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseSize, toComparableSize } from "@/lib/utils/parseSize";

type GroceryItem = { name: string; quantity: number; unit: string; pricePaid?: number | null };
type StoreResult = { price: number | null; productName: string; url?: string | null };
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

function defaultStore(item: PricedItem): "amazon" | "walmart" {
  return getWinners(item).walmartCheapest ? "walmart" : "amazon";
}

function buildAmazonCartUrl(asins: string[]): string | null {
  if (asins.length === 0) return null;
  const params = asins
    .map((asin, i) => `ASIN.${i + 1}=${asin}&Quantity.${i + 1}=1`)
    .join("&");
  return `https://www.amazon.com/gp/aws/cart/add.html?${params}&tag=slashcart-20`;
}

function PricedItemCard({
  item,
  selected,
  onSelect,
  bulkSelected,
  onBulkToggle,
  receiptStore,
}: {
  item: PricedItem;
  selected: "amazon" | "walmart";
  onSelect: (store: "amazon" | "walmart") => void;
  bulkSelected: "single" | "bulk";
  onBulkToggle: (v: "single" | "bulk") => void;
  receiptStore?: string | null;
}) {
  const amazonUnit = item.amazon.productName ? parseSize(item.amazon.productName) : null;
  const walmartUnit = item.walmart.productName ? parseSize(item.walmart.productName) : null;

  const amazonPricePerUnit =
    amazonUnit && item.amazon.price !== null ? item.amazon.price / amazonUnit.quantity : null;
  const walmartPricePerUnit =
    walmartUnit && item.walmart.price !== null ? item.walmart.price / walmartUnit.quantity : null;

  const { amazonCheapest, walmartCheapest } = getWinners(item);
  const recommendedPrice = amazonCheapest ? item.amazon.price : item.walmart.price;

  // Normalized PPU for cross-store savings % (same unit after lb→oz etc. conversion)
  const amazonNorm = toComparableSize(amazonUnit);
  const walmartNorm = toComparableSize(walmartUnit);
  const amazonNormPPU = amazonNorm && item.amazon.price !== null ? item.amazon.price / amazonNorm.quantity : null;
  const walmartNormPPU = walmartNorm && item.walmart.price !== null ? item.walmart.price / walmartNorm.quantity : null;
  const canCompare = !item.sizeMismatch && amazonNormPPU !== null && walmartNormPPU !== null && amazonNorm!.unit === walmartNorm!.unit;
  const amazonSavingsPct = canCompare && amazonCheapest ? Math.round((1 - amazonNormPPU! / walmartNormPPU!) * 100) : null;
  const walmartSavingsPct = canCompare && walmartCheapest ? Math.round((1 - walmartNormPPU! / amazonNormPPU!) * 100) : null;

  const hasBulk =
    item.amazon.bulkPrice !== null &&
    item.amazon.bulkQuantity !== null;

  const bulkPerUnit =
    item.amazon.bulkPrice !== null && item.amazon.bulkQuantity !== null
      ? item.amazon.bulkPrice / item.amazon.bulkQuantity
      : null;

  const checkedLabel = `Checked ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const amazonBuyHref =
    bulkSelected === "bulk" && item.amazon.bulkAsin
      ? `https://www.amazon.com/dp/${item.amazon.bulkAsin}?tag=slashcart-20`
      : item.amazon.asin
      ? `https://www.amazon.com/dp/${item.amazon.asin}?tag=slashcart-20`
      : `https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`;
  const walmartBuyHref = item.walmart.url
    ?? `https://www.walmart.com/search?q=${encodeURIComponent(item.walmart.productName || item.name)}`;

  console.log(
    `[buy-links] "${item.name}" | asin=${item.amazon.asin} bulkAsin=${item.amazon.bulkAsin} bulkSelected=${bulkSelected}\n` +
    `  Amazon Buy → ${amazonBuyHref}\n` +
    `  Walmart Buy → ${walmartBuyHref}`
  );

  return (
    <div className="rounded-xl border border-[#1e3050] bg-[#0d1830] px-3 py-3 sm:px-4 sm:py-4 overflow-hidden">
      <div className="mb-3 min-w-0">
        <p className="font-medium text-[#e2e8f0] capitalize truncate">{item.name}</p>
        {item.pricePaid != null && (
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[#475569] text-xs">
              You paid ${item.pricePaid.toFixed(2)}{receiptStore ? ` at ${receiptStore}` : ""}
            </span>
            {recommendedPrice !== null && (
              recommendedPrice < item.pricePaid
                ? <span className="text-[#22c55e] text-xs font-medium">Save ${(item.pricePaid - recommendedPrice).toFixed(2)} vs receipt</span>
                : <span className="text-[#22c55e] text-xs font-medium">Good price ✓</span>
            )}
          </div>
        )}
        {item.sizeMismatch && (
          <p className="text-[#f59e0b] text-[10px] mt-0.5">
            ⚠ Different sizes — prices not directly comparable
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        {/* Amazon card */}
        <div className={`rounded-lg p-2.5 border overflow-hidden ${amazonCheapest ? "border-[#22c55e]/40 bg-[#22c55e]/5" : "border-[#1e3050] bg-[#142036]"}`}>
          <div className="flex items-center justify-between gap-1 mb-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[#64748b] text-xs font-medium shrink-0">Amazon</p>
              {amazonCheapest && (
                <span className="text-[9px] font-semibold text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/30 rounded px-1 py-0.5 leading-none shrink-0">
                  Best value
                </span>
              )}
            </div>
            {hasBulk && (
              <div className="flex gap-0.5 shrink-0">
                {(["single", "bulk"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onBulkToggle(opt)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition capitalize ${
                      bulkSelected === opt
                        ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
                        : "border-[#1e3050] text-[#475569] hover:border-[#475569]"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          {item.amazon.price !== null ? (
            <>
              {bulkSelected === "bulk" && hasBulk ? (
                <>
                  {bulkPerUnit !== null ? (
                    <>
                      <p className={`font-bold text-base leading-none mb-0.5 ${amazonCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                        ${bulkPerUnit.toFixed(2)}/unit
                      </p>
                      <p className="text-[#64748b] text-[11px] leading-none mb-1">
                        ${item.amazon.bulkPrice!.toFixed(2)} · {item.amazon.bulkQuantity}-pack
                      </p>
                    </>
                  ) : (
                    <p className={`font-bold text-base leading-none mb-1 ${amazonCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                      ${item.amazon.bulkPrice!.toFixed(2)}
                      <span className="text-[#64748b] font-normal text-[11px] ml-1">{item.amazon.bulkQuantity}-pack</span>
                    </p>
                  )}
                  {item.amazon.productName !== item.name && (
                    <p className="text-[#475569] text-[10px] truncate mb-1" title={item.amazon.productName}>
                      {item.amazon.productName}
                    </p>
                  )}
                  {item.amazon.annualSavings !== null && item.amazon.annualSavings > 0 && (
                    <p className="text-[#22c55e] text-[10px] font-medium bg-[#22c55e]/10 rounded px-1.5 py-0.5 inline-block mb-1 mt-0.5">
                      Save ${item.amazon.annualSavings.toFixed(2)}/yr bulk
                    </p>
                  )}
                </>
              ) : (
                <>
                  {!item.sizeMismatch && amazonPricePerUnit !== null && amazonUnit ? (
                    <>
                      <p className={`font-bold text-base leading-none mb-0.5 ${amazonCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                        ${amazonPricePerUnit.toFixed(2)}/{amazonUnit.unit}
                      </p>
                      <p className="text-[#64748b] text-[11px] leading-none mb-1">
                        ${(item.amazon.regularPrice ?? item.amazon.price).toFixed(2)} · {amazonUnit.quantity} {amazonUnit.unit}
                      </p>
                    </>
                  ) : (
                    <p className={`font-bold text-base leading-none mb-1 ${amazonCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                      ${(item.amazon.regularPrice ?? item.amazon.price).toFixed(2)}
                      {amazonUnit && <span className="text-[#64748b] font-normal text-[11px] ml-1">{amazonUnit.quantity} {amazonUnit.unit}</span>}
                    </p>
                  )}
                  {item.amazon.productName !== item.name && (
                    <p className="text-[#475569] text-[10px] truncate mb-1" title={item.amazon.productName}>
                      {item.amazon.productName}
                    </p>
                  )}
                  {amazonSavingsPct !== null && amazonSavingsPct > 0 && (
                    <p className="text-[#22c55e] text-[10px] leading-none mb-1">
                      Save {amazonSavingsPct}% per unit vs Walmart
                    </p>
                  )}
                </>
              )}
              <div className="mt-1">
                <a href={amazonBuyHref} target="_blank" rel="noopener noreferrer" className="text-[#22c55e] hover:text-[#16a34a] text-xs transition-colors">
                  Buy →
                </a>
              </div>
              <p className="text-[10px] text-white/30 mt-1.5">{checkedLabel}</p>
            </>
          ) : (
            <>
              <p className="text-[#475569] text-xs mb-1">Unavailable</p>
              <a href={`https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`} target="_blank" rel="noopener noreferrer" className="text-[#475569] hover:text-[#64748b] text-xs transition-colors">
                Search →
              </a>
              <p className="text-[10px] text-white/30 mt-1.5">{checkedLabel}</p>
            </>
          )}
        </div>

        {/* Walmart card */}
        <div className={`rounded-lg p-2.5 border overflow-hidden ${walmartCheapest ? "border-[#22c55e]/40 bg-[#22c55e]/5" : "border-[#1e3050] bg-[#142036]"}`}>
          <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
            <p className="text-[#64748b] text-xs font-medium shrink-0">Walmart</p>
            {walmartCheapest && (
              <span className="text-[9px] font-semibold text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/30 rounded px-1 py-0.5 leading-none shrink-0">
                Best value
              </span>
            )}
          </div>
          {item.walmart.price !== null ? (
            <>
              {!item.sizeMismatch && walmartPricePerUnit !== null && walmartUnit ? (
                <>
                  <p className={`font-bold text-base leading-none mb-0.5 ${walmartCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                    ${walmartPricePerUnit.toFixed(2)}/{walmartUnit.unit}
                  </p>
                  <p className="text-[#64748b] text-[11px] leading-none mb-1">
                    ${item.walmart.price.toFixed(2)} · {walmartUnit.quantity} {walmartUnit.unit}
                  </p>
                </>
              ) : (
                <p className={`font-bold text-base leading-none mb-1 ${walmartCheapest ? "text-[#22c55e]" : "text-[#e2e8f0]"}`}>
                  ${item.walmart.price.toFixed(2)}
                  {walmartUnit && <span className="text-[#64748b] font-normal text-[11px] ml-1">{walmartUnit.quantity} {walmartUnit.unit}</span>}
                </p>
              )}
              {item.walmart.productName !== item.name && (
                <p className="text-[#475569] text-[10px] truncate mb-1" title={item.walmart.productName}>
                  {item.walmart.productName}
                </p>
              )}
              {walmartSavingsPct !== null && walmartSavingsPct > 0 && (
                <p className="text-[#22c55e] text-[10px] leading-none mb-1">
                  Save {walmartSavingsPct}% per unit vs Amazon
                </p>
              )}
              <a href={walmartBuyHref} target="_blank" rel="noopener noreferrer" className="text-[#22c55e] hover:text-[#16a34a] text-xs transition-colors">
                Buy →
              </a>
              <p className="text-[10px] text-white/30 mt-1.5">{checkedLabel}</p>
            </>
          ) : (
            <>
              <p className="text-[#475569] text-xs mb-1">Unavailable</p>
              <a href={walmartBuyHref} target="_blank" rel="noopener noreferrer" className="text-[#475569] hover:text-[#64748b] text-xs transition-colors">
                Search →
              </a>
              <p className="text-[10px] text-white/30 mt-1.5">{checkedLabel}</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2 w-full overflow-hidden">
        {(["amazon", "walmart"] as const).map((store) => {
          const available = store === "amazon" ? item.amazon.price !== null : item.walmart.price !== null;
          const active = selected === store;
          return (
            <button
              key={store}
              type="button"
              onClick={() => onSelect(store)}
              disabled={!available}
              className={`flex-1 text-xs py-2 sm:py-1.5 rounded-lg border transition capitalize ${
                !available
                  ? "border-[#1e3050] bg-[#0d1830] text-[#2d3f5c] cursor-not-allowed"
                  : active
                  ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e] font-medium"
                  : "border-[#1e3050] bg-[#0d1830] text-[#475569] hover:border-[#475569]"
              }`}
            >
              {active ? "✓ " : ""}{store === "amazon" ? "Amazon" : "Walmart"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonCard({ name, quantity, unit }: GroceryItem) {
  return (
    <div className="rounded-xl border border-[#1e3050] bg-[#0d1830] px-3 py-3 sm:px-4 sm:py-4 animate-pulse">
      <div className="mb-3">
        <p className="font-medium text-[#e2e8f0] capitalize">{name}</p>
        <p className="text-[#475569] text-xs">{quantity} {unit}</p>
        <p className="text-[#475569] text-xs mt-0.5">Searching Amazon & Walmart…</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
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
  const [storeSelections, setStoreSelections] = useState<Record<number, "amazon" | "walmart">>({});
  const [bulkSelections, setBulkSelections] = useState<Record<number, "single" | "bulk">>({});
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null);
  const [receiptStore, setReceiptStore] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const excluded = sessionStorage.getItem("slashcart_excluded");
    if (excluded) {
      try { setExcludedItems(JSON.parse(excluded)); } catch {}
    }

    const rawReceiptTotal = sessionStorage.getItem("slashcart_receipt_total");
    const rawReceiptStore = sessionStorage.getItem("slashcart_receipt_store");
    if (rawReceiptTotal) { const n = parseFloat(rawReceiptTotal); if (!isNaN(n)) setReceiptTotal(n); }
    if (rawReceiptStore) setReceiptStore(rawReceiptStore);

    const raw = sessionStorage.getItem("slashcart_items");
    if (!raw) {
      setError("No grocery list found. Please go back and try again.");
      setLoading(false);
      return;
    }

    const items: GroceryItem[] = (JSON.parse(raw) as GroceryItem[]).map((item) => ({
      ...item,
      pricePaid: item.pricePaid != null && item.pricePaid > 0 ? item.pricePaid : null,
    }));

    setGroceryItems(items);
    setPricedItems(new Array(items.length).fill(null));
    setBulkSelections(Object.fromEntries(items.map((_, i) => [i, "single" as const])));
    setLoading(false);

    fetch("/api/search-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
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
  if (totals !== null && groceryItems.length === 0) return <EmptyState />;

  const allLoaded = totals !== null;
  const round = (n: number) => Math.round(n * 100) / 100;

  // Show split-cart banner when at least one item is recommended on each store
  const showSplitBanner = allLoaded && (() => {
    const filled = (pricedItems as PricedItem[]).filter((item) => !item.sizeMismatch);
    const hasAmazon = filled.some((item) => getWinners(item).amazonCheapest);
    const hasWalmart = filled.some((item) => getWinners(item).walmartCheapest);
    return hasAmazon && hasWalmart;
  })();

  const excludedPreview =
    excludedItems.slice(0, 3).map((i) => i.name).join(", ") +
    (excludedItems.length > 3 ? ", etc." : "");

  // Derive selected items by iterating groceryItems so the index always
  // matches storeSelections/bulkSelections keys.
  const amazonSelectedEntries: { index: number; item: PricedItem }[] = [];
  const walmartSelectedItems: PricedItem[] = [];
  if (allLoaded) {
    groceryItems.forEach((_, i) => {
      const item = pricedItems[i];
      if (!item) return;
      const store = storeSelections[i] ?? defaultStore(item);
      if (store === "amazon") amazonSelectedEntries.push({ index: i, item });
      else walmartSelectedItems.push(item);
    });
  }

  const totalAnnualSavings = allLoaded
    ? Math.round(
        amazonSelectedEntries.reduce((sum, { index, item }) => {
          const isBulk = (bulkSelections[index] ?? "single") === "bulk";
          return sum + (isBulk ? (item.amazon.annualSavings ?? 0) : 0);
        }, 0) * 100
      ) / 100
    : 0;

  const amazonCartAsins = amazonSelectedEntries
    .map(({ index, item }) => {
      const isBulk = (bulkSelections[index] ?? "single") === "bulk";
      const asin = isBulk && item.amazon.bulkAsin ? item.amazon.bulkAsin : item.amazon.asin;
      return asin;
    })
    .filter((asin): asin is string => typeof asin === "string" && asin.length > 0);

  const amazonSelectedTotal = round(
    amazonSelectedEntries.reduce((s, { index, item }) => {
      const isBulk = (bulkSelections[index] ?? "single") === "bulk";
      const price = isBulk && item.amazon.bulkPrice !== null
        ? item.amazon.bulkPrice
        : (item.amazon.price ?? 0);
      return s + price;
    }, 0)
  );
  const walmartSelectedTotal = round(walmartSelectedItems.reduce((s, item) => s + (item.walmart.price ?? 0), 0));
  const amazonCartUrl = buildAmazonCartUrl(amazonCartAsins);

  // Cart total matches exactly what's shown in the checkout breakdown
  const slashcartTotal = round(amazonSelectedTotal + walmartSelectedTotal);
  const foundCount = allLoaded
    ? (pricedItems.filter(Boolean) as PricedItem[]).filter(
        (item) => item.amazon.price !== null || item.walmart.price !== null
      ).length
    : 0;
  const totalCount = groceryItems.length;

  // Savings-only totals: include only items where our recommended price beats pricePaid.
  // Items where recPrice >= pricePaid ("Good price ✓") are excluded from both sides
  // so they don't suppress the savings figure.
  const savingsEntries = allLoaded
    ? (pricedItems.filter(Boolean) as PricedItem[]).filter((item) => {
        if (!item.pricePaid || item.pricePaid <= 0) return false;
        const { amazonCheapest } = getWinners(item);
        const recPrice = (amazonCheapest ? item.amazon.price : item.walmart.price) ?? null;
        return recPrice !== null && recPrice < item.pricePaid;
      })
    : [];
  const savingsReceiptTotal = round(savingsEntries.reduce((s, item) => s + (item.pricePaid ?? 0), 0));
  const savingsSlashcartTotal = round(savingsEntries.reduce((s, item) => {
    const { amazonCheapest } = getWinners(item);
    return s + ((amazonCheapest ? item.amazon.price : item.walmart.price) ?? 0);
  }, 0));
  const totalReceiptSavings = receiptTotal !== null && savingsEntries.length > 0
    ? round(savingsReceiptTotal - savingsSlashcartTotal)
    : 0;

  const pantryReceiptTotal = allLoaded
    ? round((pricedItems.filter(Boolean) as PricedItem[]).reduce(
        (s, item) => s + (item.pricePaid && item.pricePaid > 0 ? item.pricePaid : 0), 0
      ))
    : 0;
  const savingsPct = pantryReceiptTotal > 0
    ? Math.round((totalReceiptSavings / pantryReceiptTotal) * 100)
    : 0;

  if (allLoaded) {
    console.log('[savings] receiptTotal:', receiptTotal);
    console.log('[savings] savingsReceiptTotal:', savingsReceiptTotal);
    console.log('[savings] savingsSlashcartTotal:', savingsSlashcartTotal);
    console.log('[savings] totalReceiptSavings:', totalReceiptSavings);
    console.log('[savings] savingsEntries count:', savingsEntries.length);
  }

  return (
    <main className="flex flex-col flex-1 w-full overflow-x-hidden px-3 py-6 sm:px-4 sm:py-10 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-[#22c55e] text-sm hover:underline mb-3 inline-block">
          ← New search
        </Link>
        <h1 className="text-xl sm:text-3xl font-bold text-[#e2e8f0]">Price Comparison</h1>
        <p className="text-[#94a3b8] text-sm mt-1">
          {groceryItems.length} pantry staple{groceryItems.length !== 1 ? "s" : ""} · unit price comparison
        </p>
      </div>

      {excludedItems.length > 0 && (
        <p className="text-[#475569] text-sm mb-5 px-1">
          Showing pantry staples only. Fresh items ({excludedPreview}) are not included.
        </p>
      )}

      {allLoaded && receiptTotal !== null ? (
        <div className="mb-5 rounded-xl bg-[#0d2e1a] border border-[#22c55e]/40 px-5 py-5">
          <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">
            You spent{" "}
            <span className="text-[#e2e8f0] font-semibold">${pantryReceiptTotal.toFixed(2)}</span>
            {" "}on{" "}
            <span className="text-[#e2e8f0] font-semibold">{totalCount}</span>
            {" "}pantry items
            {receiptStore ? <> at <span className="text-[#e2e8f0] font-semibold">{receiptStore}</span></> : ""}.
            {totalReceiptSavings > 0 && (
              <>{" "}We save you{" "}
                <span className="text-[#22c55e] font-semibold">{savingsPct}%</span>
                {" "}on{" "}
                <span className="text-[#e2e8f0] font-semibold">{savingsEntries.length}</span>
                {" "}of them.
              </>
            )}
          </p>
          {totalReceiptSavings > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">💰</span>
              <div>
                <p className="text-[#94a3b8] text-xs uppercase tracking-wide font-medium">Save on your next shop</p>
                <p className="text-[#22c55e] text-4xl font-bold leading-tight">${totalReceiptSavings.toFixed(2)}</p>
                <p className="text-white/30 text-xs mt-1">{foundCount} of {totalCount} items found</p>
              </div>
            </div>
          ) : (
            <p className="text-[#22c55e] text-sm font-medium">✓ You got good prices on all these items</p>
          )}
          <p className="text-white/30 text-xs mt-4">
            ${receiptTotal.toFixed(2)} total receipt
            {receiptStore ? ` at ${receiptStore}` : ""}
            {" "}— fresh items and unavailable items excluded from savings
          </p>
        </div>
      ) : showSplitBanner ? (
        <div className="mb-4 rounded-xl border border-[#1e3050] bg-[#0a1628] px-4 py-3 flex items-start gap-2.5">
          <span className="text-base mt-0.5 shrink-0">💡</span>
          <p className="text-[#e2e8f0] text-sm leading-snug">
            We split your cart across stores to get the best unit price on each item.
          </p>
        </div>
      ) : null}

      {allLoaded && totalAnnualSavings > 0 && (
        <div className="mb-6 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-4 py-4">
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
          Hang on, comparing unit prices across Amazon and Walmart…
        </p>
      )}

      <div className="space-y-3 mb-8">
        {groceryItems.map((groceryItem, i) => {
          const priced = pricedItems[i];
          return priced
            ? <PricedItemCard
                key={i}
                item={priced}
                selected={storeSelections[i] ?? defaultStore(priced)}
                onSelect={(store) => setStoreSelections((prev) => ({ ...prev, [i]: store }))}
                bulkSelected={bulkSelections[i] ?? "single"}
                onBulkToggle={(v) => setBulkSelections((prev) => ({ ...prev, [i]: v }))}
                receiptStore={receiptStore}
              />
            : <SkeletonCard key={i} {...groceryItem} />;
        })}
      </div>

      {allLoaded && (
        <>
          {totalAnnualSavings > 0 && (
            <div className="rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-4 py-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <span className="text-[#22c55e] font-semibold text-sm block">
                  Total annual savings buying in bulk
                </span>
                <span className="text-[#94a3b8] text-xs">vs. buying single units monthly</span>
              </div>
              <span className="text-[#22c55e] font-bold text-xl sm:text-2xl">
                ${totalAnnualSavings.toFixed(2)}
              </span>
            </div>
          )}

          {receiptTotal !== null && totalReceiptSavings > 0 && (
            <div className="rounded-xl bg-[#0d2e1a] border border-[#22c55e]/40 px-4 py-3 flex items-center justify-between gap-4 mb-4">
              <p className="text-[#94a3b8] text-sm">You save on your next shop</p>
              <p className="text-[#22c55e] text-2xl font-bold leading-tight shrink-0">${totalReceiptSavings.toFixed(2)}</p>
            </div>
          )}

          <div className="space-y-3 mt-2 mb-2">
            {amazonCartUrl && (
              <div>
                <p className="text-[#94a3b8] text-xs mb-2">
                  {amazonSelectedEntries.length} item{amazonSelectedEntries.length !== 1 ? "s" : ""} on Amazon
                  {" · "}<span className="text-[#e2e8f0] font-medium">${amazonSelectedTotal.toFixed(2)}</span>
                </p>
                <a
                  href={amazonCartUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-base px-6 py-4 transition-colors"
                >
                  Checkout on Amazon →
                </a>
              </div>
            )}
            {walmartSelectedItems.length > 0 && (
              <div>
                <p className="text-[#94a3b8] text-xs mb-2">
                  {walmartSelectedItems.length} item{walmartSelectedItems.length !== 1 ? "s" : ""} on Walmart
                  {" · "}<span className="text-[#e2e8f0] font-medium">${walmartSelectedTotal.toFixed(2)}</span>
                </p>
                <a
                  href="https://www.walmart.com/cart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center rounded-xl border border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10 font-bold text-base px-6 py-4 transition-colors"
                >
                  Checkout on Walmart →
                </a>
              </div>
            )}
          </div>
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

function EmptyState() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center gap-5 px-6 text-center">
      <p className="text-4xl">🛒</p>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-bold text-[#e2e8f0]">No pantry staples found</h2>
        <p className="text-[#94a3b8] text-sm leading-relaxed">
          SlashCart compares prices on packaged goods and pantry staples. Fresh items like produce,
          meat, and dairy aren&apos;t included. Try adding items like flour, olive oil, toothpaste,
          or paper towels.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-[#0b1426] font-semibold text-sm px-6 py-3 transition-colors"
      >
        Try again
      </Link>
    </main>
  );
}
