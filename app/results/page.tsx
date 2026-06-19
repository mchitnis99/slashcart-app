"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { parseSize, toComparableSize } from "@/lib/utils/parseSize";
import { extractVariantLabel, VARIANT_GROUPS } from "@/lib/scrapers/filters";
import FeedbackForm from "@/app/components/FeedbackForm";

type GroceryItem = { name: string; quantity: number; unit: string; pricePaid?: number | null };
type WalmartVariant = { price: number | null; productName: string; url?: string | null; imageUrl?: string | null };
type AmazonVariant = {
  price: number | null; productName: string; asin: string | null; imageUrl?: string | null;
  regularPrice: number | null; bulkPrice: number | null; bulkQuantity: number | null; bulkAsin: string | null;
  isDifferentBrand?: boolean;
};
type StoreResult = WalmartVariant & { candidates?: WalmartVariant[] };
type AmazonStoreResult = AmazonVariant & {
  annualSavings: number | null;
  candidates?: AmazonVariant[];
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

  let amazonCheapest: boolean;
  let walmartCheapest: boolean;

  if (amazonNormPPU !== null && walmartNormPPU !== null && amazonNorm!.unit === walmartNorm!.unit) {
    amazonCheapest = amazonNormPPU <= walmartNormPPU;
    walmartCheapest = walmartNormPPU <= amazonNormPPU;
  } else {
    const prices = [item.amazon.price, item.walmart.price].filter((p): p is number => p !== null);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    amazonCheapest = minPrice !== null && item.amazon.price === minPrice;
    walmartCheapest = minPrice !== null && item.walmart.price === minPrice;
  }

  // Gate by pricePaid: a store only "wins" if its price is actually less than what was paid.
  if (item.pricePaid && item.pricePaid > 0) {
    if (item.amazon.price !== null && item.amazon.price >= item.pricePaid) amazonCheapest = false;
    if (item.walmart.price !== null && item.walmart.price >= item.pricePaid) walmartCheapest = false;
  }

  const canCompare = amazonNormPPU !== null && walmartNormPPU !== null && !!amazonNorm && !!walmartNorm && amazonNorm.unit === walmartNorm.unit;

  return { amazonCheapest, walmartCheapest };
}

function defaultStore(item: PricedItem): "amazon" | "walmart" {
  return getWinners(item).walmartCheapest ? "walmart" : "amazon";
}

// PPU-normalized savings: how much cheaper it'd be to buy the same quantity as the
// shelf label at the found product's per-unit price. Falls back to a raw price
// difference (flagged via `approx`) when the shelf label's size can't be normalized
// to the same unit as the found product. Returns `lowerPrice: true` (no $ figure)
// when the found product's own size can't be parsed at all.
function computeSavings(
  pricePaid: number | null | undefined,
  shelfQuantity: number,
  shelfUnit: string,
  recPrice: number | null,
  recProductName: string | null
): { amount: number | null; approx: boolean; lowerPrice: boolean } {
  if (recPrice === null || !pricePaid || pricePaid <= 0) {
    return { amount: null, approx: false, lowerPrice: false };
  }

  const recNorm = toComparableSize(recProductName ? parseSize(recProductName) : null);
  const recNormPPU = recNorm ? recPrice / recNorm.quantity : null;

  if (recNormPPU === null) {
    return { amount: null, approx: false, lowerPrice: recPrice < pricePaid };
  }

  const shelfNorm = shelfQuantity > 0 && shelfUnit
    ? toComparableSize({ quantity: shelfQuantity, unit: shelfUnit })
    : null;
  const shelfPpu = shelfNorm ? pricePaid / shelfNorm.quantity : null;

  if (shelfPpu !== null && shelfNorm!.unit === recNorm!.unit) {
    return { amount: pricePaid - recNormPPU * shelfNorm!.quantity, approx: false, lowerPrice: false };
  }

  return { amount: pricePaid - recPrice, approx: true, lowerPrice: false };
}

// Compute deduplicated pill labels for a set of variant candidates.
// If two candidates produce the same base label, append the size to distinguish them.
function getVariantLabels(variants: Array<{ productName: string }>, itemName: string): string[] {
  const raw = variants.map((v) => extractVariantLabel(v.productName, itemName));
  const counts = new Map<string, number>();
  raw.forEach((l) => counts.set(l, (counts.get(l) ?? 0) + 1));
  if ([...counts.values()].every((c) => c === 1)) return raw;

  return variants.map((v, i) => {
    const label = raw[i];
    if ((counts.get(label) ?? 1) <= 1) return label;
    const sizeMatch =
      v.productName.match(/\d+(?:\.\d+)?[\s\-]*fl[\s\-]*oz\b/i) ??
      v.productName.match(/\d+(?:\.\d+)?[\s\-]*oz\b/i) ??
      v.productName.match(/\d+(?:\.\d+)?[\s\-]*lb\b/i) ??
      v.productName.match(/\d+(?:\.\d+)?[\s\-]*count\b/i);
    return sizeMatch ? `${label} ${sizeMatch[0].trim().replace(/\s+/g, "")}` : label;
  });
}

function buildAmazonCartUrl(asins: string[]): string | null {
  if (asins.length === 0) return null;
  const params = asins
    .map((asin, i) => `ASIN.${i + 1}=${asin}&Quantity.${i + 1}=1`)
    .join("&");
  return `https://www.amazon.com/gp/aws/cart/add.html?${params}&tag=slashcart-20`;
}

function buildWalmartCartUrl(items: PricedItem[]): string | null {
  const ids = items
    .map((item) => {
      const raw = item.walmart.url ?? null;
      const match = raw?.match(/\/ip\/[^/]+\/(\d+)/);
      const rawId = match?.[1] ?? null;
      // parseInt strips any non-digit suffix (e.g. ":1" variant suffixes in some URLs)
      const numId = rawId ? parseInt(rawId, 10) : NaN;
      const id = !isNaN(numId) && numId > 0 ? String(numId) : null;
      return id;
    })
    .filter((id): id is string => id !== null);
  if (ids.length === 0) return null;
  const url = `https://www.walmart.com/cart/add?items=${ids.map((id) => `${id}:1`).join(",")}`;
  return url;
}

// Given both stores' variant lists, return the initial indexes that best match a
// shared variant keyword. When Amazon[0] contains "olive oil" and Walmart has an
// "olive oil" candidate at index 2, Walmart defaults to 2 instead of 0.
function findDefaultVariantIndexes(
  amazonVariants: { productName: string }[],
  walmartVariants: { productName: string }[]
): { amazonIdx: number; walmartIdx: number } {
  if (amazonVariants.length < 2 && walmartVariants.length < 2) return { amazonIdx: 0, walmartIdx: 0 };
  const keywords = VARIANT_GROUPS.flat().sort((a, b) => b.length - a.length);
  const findKeyword = (name: string) => keywords.find((k) => name.toLowerCase().includes(k)) ?? null;

  const keyA = findKeyword(amazonVariants[0]?.productName ?? "");
  if (keyA) {
    const wIdx = walmartVariants.findIndex((v) => v.productName.toLowerCase().includes(keyA));
    if (wIdx > 0) return { amazonIdx: 0, walmartIdx: wIdx };
  }
  const keyW = findKeyword(walmartVariants[0]?.productName ?? "");
  if (keyW) {
    const aIdx = amazonVariants.findIndex((v) => v.productName.toLowerCase().includes(keyW));
    if (aIdx > 0) return { amazonIdx: aIdx, walmartIdx: 0 };
  }
  return { amazonIdx: 0, walmartIdx: 0 };
}

function PricedItemCard({
  item,
  selected,
  onSelect,
  bulkSelected,
  onBulkToggle,
  receiptStore,
  isTextMode,
}: {
  item: PricedItem;
  selected: "amazon" | "walmart";
  onSelect: (store: "amazon" | "walmart") => void;
  bulkSelected: "single" | "bulk";
  onBulkToggle: (v: "single" | "bulk") => void;
  receiptStore?: string | null;
  isTextMode?: boolean;
}) {
  // Derive variant lists first so they can seed the default index matching
  const amazonVariants: AmazonVariant[] = item.amazon.candidates?.length
    ? item.amazon.candidates
    : [{ price: item.amazon.price, productName: item.amazon.productName, asin: item.amazon.asin,
         imageUrl: item.amazon.imageUrl, regularPrice: item.amazon.regularPrice,
         bulkPrice: item.amazon.bulkPrice, bulkQuantity: item.amazon.bulkQuantity, bulkAsin: item.amazon.bulkAsin,
         isDifferentBrand: item.amazon.isDifferentBrand }];
  const walmartVariants: WalmartVariant[] = item.walmart.candidates?.length
    ? item.walmart.candidates
    : [{ price: item.walmart.price, productName: item.walmart.productName,
         url: item.walmart.url, imageUrl: item.walmart.imageUrl }];

  const [amazonVariantIdx, setAmazonVariantIdx] = useState(
    () => findDefaultVariantIndexes(amazonVariants, walmartVariants).amazonIdx
  );
  const [walmartVariantIdx, setWalmartVariantIdx] = useState(
    () => findDefaultVariantIndexes(amazonVariants, walmartVariants).walmartIdx
  );

  const selAmazon = amazonVariants[Math.min(amazonVariantIdx, amazonVariants.length - 1)];
  const selWalmart = walmartVariants[Math.min(walmartVariantIdx, walmartVariants.length - 1)];

  // Override item.amazon/walmart fields with selected variant so all downstream logic is consistent
  const effectiveAmazon = { ...item.amazon, ...selAmazon };
  const effectiveWalmart = { ...item.walmart, ...selWalmart };

  const amazonUnit = effectiveAmazon.productName ? parseSize(effectiveAmazon.productName) : null;
  const walmartUnit = effectiveWalmart.productName ? parseSize(effectiveWalmart.productName) : null;

  // PPU can't be computed when a result has a price but its size couldn't be parsed.
  const amazonSizeUnknown = effectiveAmazon.price !== null && amazonUnit === null;
  const walmartSizeUnknown = effectiveWalmart.price !== null && walmartUnit === null;

  const amazonPricePerUnit =
    amazonUnit && effectiveAmazon.price !== null ? effectiveAmazon.price / amazonUnit.quantity : null;
  const walmartPricePerUnit =
    walmartUnit && effectiveWalmart.price !== null ? effectiveWalmart.price / walmartUnit.quantity : null;

  const { amazonCheapest, walmartCheapest } = getWinners({ ...item, amazon: effectiveAmazon, walmart: effectiveWalmart });
  const recommendedPrice = amazonCheapest ? effectiveAmazon.price : effectiveWalmart.price;
  const recommendedProductName = amazonCheapest ? effectiveAmazon.productName : effectiveWalmart.productName;
  // Text-mode items have baseline prices, not real receipt prices. Raw price comparison
  // is correct here — PPU normalization misleads when sizes differ from the baseline.
  const savings = isTextMode
    ? {
        amount: recommendedPrice !== null && item.pricePaid != null && item.pricePaid > 0
          ? item.pricePaid - recommendedPrice
          : null,
        approx: false,
        lowerPrice: false,
      }
    : computeSavings(item.pricePaid, item.quantity, item.unit, recommendedPrice, recommendedProductName);

  // Hero savings line: PPU-normalized saving for the recommended (best-value) store,
  // expressed as a percentage of the shelf price, with a PPU-comparison subline.
  const hasHeroSaving = savings.amount !== null && savings.amount > 0 && item.pricePaid != null;
  const heroStoreName = amazonCheapest ? "Amazon" : "Walmart";
  const heroPct = hasHeroSaving ? Math.round((savings.amount! / item.pricePaid!) * 100) : null;
  const heroPPU = amazonCheapest ? amazonPricePerUnit : walmartPricePerUnit;
  const heroUnit = amazonCheapest ? amazonUnit : walmartUnit;
  const shelfPpu = item.pricePaid != null && item.quantity > 0 ? item.pricePaid / item.quantity : null;

  // Normalized PPU for cross-store savings % (same unit after lb→oz etc. conversion)
  const amazonNorm = toComparableSize(amazonUnit);
  const walmartNorm = toComparableSize(walmartUnit);
  const amazonNormPPU = amazonNorm && effectiveAmazon.price !== null ? effectiveAmazon.price / amazonNorm.quantity : null;
  const walmartNormPPU = walmartNorm && effectiveWalmart.price !== null ? effectiveWalmart.price / walmartNorm.quantity : null;

  const canCompare = !item.sizeMismatch && amazonNormPPU !== null && walmartNormPPU !== null && amazonNorm!.unit === walmartNorm!.unit;
  // Line 2: pure store-vs-store per-unit comparison — independent of pricePaid gating
  const amazonVsWalmartPct = canCompare && amazonNormPPU! < walmartNormPPU!
    ? Math.round((1 - amazonNormPPU! / walmartNormPPU!) * 100)
    : null;
  const walmartVsAmazonPct = canCompare && walmartNormPPU! < amazonNormPPU!
    ? Math.round((1 - walmartNormPPU! / amazonNormPPU!) * 100)
    : null;

  const hasBulk = effectiveAmazon.bulkPrice !== null && effectiveAmazon.bulkQuantity !== null;
  const bulkPerUnit = effectiveAmazon.bulkPrice !== null && effectiveAmazon.bulkQuantity !== null
    ? effectiveAmazon.bulkPrice / effectiveAmazon.bulkQuantity
    : null;

  // Action line: the size/price of the listing to buy.
  const amazonActionLabel = amazonUnit && effectiveAmazon.price !== null
    ? `Buy ${amazonUnit.quantity} ${amazonUnit.unit} for $${(effectiveAmazon.regularPrice ?? effectiveAmazon.price).toFixed(2)}`
    : null;
  const walmartActionLabel = walmartUnit && effectiveWalmart.price !== null
    ? `Buy ${walmartUnit.quantity} ${walmartUnit.unit} for $${effectiveWalmart.price.toFixed(2)}`
    : null;

  const checkedLabel = `Checked ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const amazonPillLabels = amazonVariants.length >= 2 ? getVariantLabels(amazonVariants, item.name) : [];
  const walmartPillLabels = walmartVariants.length >= 2 ? getVariantLabels(walmartVariants, item.name) : [];

  const amazonBuyHref =
    bulkSelected === "bulk" && effectiveAmazon.bulkAsin
      ? `https://www.amazon.com/dp/${effectiveAmazon.bulkAsin}?tag=slashcart-20`
      : effectiveAmazon.asin
      ? `https://www.amazon.com/dp/${effectiveAmazon.asin}?tag=slashcart-20`
      : `https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&i=grocery`;
  const walmartBuyHref = effectiveWalmart.url
    ?? `https://www.walmart.com/search?q=${encodeURIComponent(effectiveWalmart.productName || item.name)}`;

  return (
    <div className="rounded-xl border border-[#1e3050] bg-[#111827] px-3 py-3 sm:px-4 sm:py-4 overflow-hidden">
      <div className="mb-3 min-w-0">
        <p className="font-semibold text-white capitalize truncate">{item.name}</p>
        {item.pricePaid != null && (
          hasHeroSaving ? (
            <>
              <p className="text-[#22c55e] text-lg font-bold leading-tight mt-1">
                Save {heroPct}% on {heroStoreName}
              </p>
              {isTextMode ? (
                <p className="text-[#94a3b8] text-xs mt-0.5">
                  Typical ${item.pricePaid.toFixed(2)} → {heroStoreName} ${recommendedPrice!.toFixed(2)}
                </p>
              ) : (
                shelfPpu !== null && heroPPU !== null && heroUnit && (
                  <p className="text-[#94a3b8] text-xs mt-0.5">
                    Store price ${shelfPpu.toFixed(2)}/{item.unit} → {heroStoreName} ${heroPPU.toFixed(2)}/{heroUnit.unit}
                  </p>
                )
              )}
              <p className="text-[#475569] text-xs mt-0.5">
                {isTextMode
                  ? `Typical grocery price $${item.pricePaid.toFixed(2)}`
                  : `In store you'll pay $${item.pricePaid.toFixed(2)}${receiptStore ? ` at ${receiptStore}` : ""}`}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[#475569] text-xs">
                {isTextMode
                  ? `Typical $${item.pricePaid.toFixed(2)}`
                  : `You paid $${item.pricePaid.toFixed(2)}${receiptStore ? ` at ${receiptStore}` : ""}`}
              </span>
              {recommendedPrice !== null && (
                savings.lowerPrice
                  ? <span className="text-[#22c55e] text-xs font-medium">Lower price</span>
                  : <span className="text-[#22c55e] text-xs font-medium">Good price ✓</span>
              )}
            </div>
          )
        )}
        {(amazonSizeUnknown || walmartSizeUnknown) && (
          <p className="text-[#f59e0b] text-[10px] mt-0.5">
            ⚠ {amazonSizeUnknown && walmartSizeUnknown
              ? "Size unavailable for Amazon and Walmart — per-unit price not shown"
              : amazonSizeUnknown
              ? "Size unavailable for Amazon — per-unit price not shown"
              : "Size unavailable for Walmart — per-unit price not shown"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        {/* Amazon card — entire card is clickable */}
        <a
          href={effectiveAmazon.price !== null ? amazonBuyHref : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className={`block rounded-lg p-3 border overflow-hidden cursor-pointer ${amazonCheapest ? "border-[#22c55e]/50 bg-[#0a2018]" : "border-[#334155] bg-[#1a2d3f]"}`}
          onClick={(e) => { if (effectiveAmazon.price === null) e.preventDefault(); }}
        >
          <div className="flex items-center justify-between gap-1 mb-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[#94a3b8] text-xs font-medium shrink-0">Amazon</p>
              {amazonCheapest && !effectiveAmazon.isDifferentBrand && (
                <span className="text-[9px] font-semibold text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/30 rounded px-1 py-0.5 leading-none shrink-0">
                  Best value
                </span>
              )}
              {effectiveAmazon.isDifferentBrand && (
                <span className="text-[9px] font-semibold text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded px-1 py-0.5 leading-none shrink-0">
                  {amazonCheapest ? "Best value — different brand" : "Different brand"}
                </span>
              )}
            </div>
            {hasBulk && (
              <div className="flex gap-0.5 shrink-0">
                {(["single", "bulk"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onBulkToggle(opt); }}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition capitalize ${
                      bulkSelected === opt
                        ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
                        : "border-[#334155] text-[#475569] hover:border-[#475569]"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Variant pills */}
          {amazonVariants.length >= 2 && (
            <div className="mb-2">
              <p className="text-white text-xs mb-1">Pick your variant:</p>
              <div className="flex flex-wrap gap-1.5">
                {amazonVariants.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAmazonVariantIdx(idx); }}
                    className={`text-sm px-3 py-1.5 rounded border transition ${
                      amazonVariantIdx === idx
                        ? "border-[#22c55e] bg-[#22c55e] text-white font-medium"
                        : "border-white/40 text-white/70 hover:border-white/60"
                    }`}
                  >
                    {amazonPillLabels[idx]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product image */}
          <div className="w-20 h-20 mb-2 rounded-md bg-[#0d1830] flex items-center justify-center overflow-hidden shrink-0">
            {effectiveAmazon.imageUrl ? (
              <Image src={effectiveAmazon.imageUrl} alt={effectiveAmazon.productName} width={80} height={80} className="object-contain w-full h-full" unoptimized />
            ) : (
              <div className="w-full h-full bg-[#1a2d3f]" />
            )}
          </div>

          {effectiveAmazon.price !== null ? (
            <>
              {bulkSelected === "bulk" && hasBulk ? (
                <>
                  {bulkPerUnit !== null ? (
                    <>
                      <p className={`font-bold text-xl leading-none mb-0.5 ${amazonCheapest ? "text-[#22c55e]" : "text-white"}`}>
                        ${bulkPerUnit.toFixed(2)}/unit
                      </p>
                      <p className="text-[#94a3b8] text-xs leading-none mb-1">
                        ${effectiveAmazon.bulkPrice!.toFixed(2)} · {effectiveAmazon.bulkQuantity}-pack
                      </p>
                    </>
                  ) : (
                    <p className={`font-bold text-xl leading-none mb-1 ${amazonCheapest ? "text-[#22c55e]" : "text-white"}`}>
                      ${effectiveAmazon.bulkPrice!.toFixed(2)}
                      <span className="text-[#94a3b8] font-normal text-xs ml-1">{effectiveAmazon.bulkQuantity}-pack</span>
                    </p>
                  )}
                  {effectiveAmazon.productName !== item.name && (
                    <p className="text-[#64748b] text-[10px] truncate mb-1" title={effectiveAmazon.productName}>
                      {effectiveAmazon.productName}
                    </p>
                  )}
                  {effectiveAmazon.annualSavings !== null && effectiveAmazon.annualSavings > 0 && (
                    <p className="text-[#22c55e] text-[10px] font-medium bg-[#22c55e]/10 rounded px-1.5 py-0.5 inline-block mb-1 mt-0.5">
                      Save ${effectiveAmazon.annualSavings.toFixed(2)}/yr bulk
                    </p>
                  )}
                </>
              ) : (
                <>
                  {amazonPricePerUnit !== null && amazonUnit ? (
                    <>
                      <p className={`font-bold text-xl leading-none mb-0.5 ${amazonCheapest ? "text-[#22c55e]" : "text-white"}`}>
                        ${amazonPricePerUnit.toFixed(2)}/{amazonUnit.unit}
                      </p>
                      <p className="text-[#94a3b8] text-xs leading-none mb-1">
                        ${(effectiveAmazon.regularPrice ?? effectiveAmazon.price).toFixed(2)} · {amazonUnit.quantity} {amazonUnit.unit}
                      </p>
                    </>
                  ) : (
                    <p className={`font-bold text-xl leading-none mb-1 ${amazonCheapest ? "text-[#22c55e]" : "text-white"}`}>
                      ${(effectiveAmazon.regularPrice ?? effectiveAmazon.price).toFixed(2)}
                      {amazonUnit && <span className="text-[#94a3b8] font-normal text-xs ml-1">· {amazonUnit.quantity} {amazonUnit.unit}</span>}
                    </p>
                  )}
                  {effectiveAmazon.productName !== item.name && (
                    <p className="text-[#64748b] text-[10px] truncate mb-1" title={effectiveAmazon.productName}>
                      {effectiveAmazon.productName}
                    </p>
                  )}
                  {amazonActionLabel && (
                    <p className="text-[#94a3b8] text-[10px] leading-none mb-1">
                      {amazonActionLabel}
                    </p>
                  )}
                  {amazonVsWalmartPct !== null && amazonVsWalmartPct > 0 && (
                    <p className="text-[#22c55e] text-[10px] leading-none mb-1">
                      {amazonVsWalmartPct}% cheaper per unit than Walmart
                    </p>
                  )}
                </>
              )}
              <p className="text-[10px] text-white/30 mt-2">{checkedLabel}</p>
            </>
          ) : (
            <>
              <p className="text-[#475569] text-xs mb-1">Unavailable</p>
              <span className="text-[#475569] text-xs">Search →</span>
              <p className="text-[10px] text-white/30 mt-2">{checkedLabel}</p>
            </>
          )}
        </a>

        {/* Walmart card — entire card is clickable */}
        <a
          href={effectiveWalmart.price !== null ? walmartBuyHref : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className={`block rounded-lg p-3 border overflow-hidden cursor-pointer ${walmartCheapest ? "border-[#22c55e]/50 bg-[#0a2018]" : "border-[#334155] bg-[#1a2d3f]"}`}
          onClick={(e) => { if (effectiveWalmart.price === null) e.preventDefault(); }}
        >
          <div className="flex items-center gap-1.5 mb-2 min-w-0">
            <p className="text-[#94a3b8] text-xs font-medium shrink-0">Walmart</p>
            {walmartCheapest && (
              <span className="text-[9px] font-semibold text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/30 rounded px-1 py-0.5 leading-none shrink-0">
                Best value
              </span>
            )}
          </div>

          {/* Variant pills */}
          {walmartVariants.length >= 2 && (
            <div className="mb-2">
              <p className="text-white text-xs mb-1">Pick your variant:</p>
              <div className="flex flex-wrap gap-1.5">
                {walmartVariants.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setWalmartVariantIdx(idx); }}
                    className={`text-sm px-3 py-1.5 rounded border transition ${
                      walmartVariantIdx === idx
                        ? "border-[#22c55e] bg-[#22c55e] text-white font-medium"
                        : "border-white/40 text-white/70 hover:border-white/60"
                    }`}
                  >
                    {walmartPillLabels[idx]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product image */}
          <div className="w-20 h-20 mb-2 rounded-md bg-[#0d1830] flex items-center justify-center overflow-hidden shrink-0">
            {effectiveWalmart.imageUrl ? (
              <Image src={effectiveWalmart.imageUrl} alt={effectiveWalmart.productName} width={80} height={80} className="object-contain w-full h-full" unoptimized />
            ) : (
              <div className="w-full h-full bg-[#1a2d3f]" />
            )}
          </div>

          {effectiveWalmart.price !== null ? (
            <>
              {walmartPricePerUnit !== null && walmartUnit ? (
                <>
                  <p className={`font-bold text-xl leading-none mb-0.5 ${walmartCheapest ? "text-[#22c55e]" : "text-white"}`}>
                    ${walmartPricePerUnit.toFixed(2)}/{walmartUnit.unit}
                  </p>
                  <p className="text-[#94a3b8] text-xs leading-none mb-1">
                    ${effectiveWalmart.price.toFixed(2)} · {walmartUnit.quantity} {walmartUnit.unit}
                  </p>
                </>
              ) : (
                <p className={`font-bold text-xl leading-none mb-1 ${walmartCheapest ? "text-[#22c55e]" : "text-white"}`}>
                  ${effectiveWalmart.price.toFixed(2)}
                  {walmartUnit && <span className="text-[#94a3b8] font-normal text-xs ml-1">· {walmartUnit.quantity} {walmartUnit.unit}</span>}
                </p>
              )}
              {effectiveWalmart.productName !== item.name && (
                <p className="text-[#64748b] text-[10px] truncate mb-1" title={effectiveWalmart.productName}>
                  {effectiveWalmart.productName}
                </p>
              )}
              {walmartActionLabel && (
                <p className="text-[#94a3b8] text-[10px] leading-none mb-1">
                  {walmartActionLabel}
                </p>
              )}
              {walmartVsAmazonPct !== null && walmartVsAmazonPct > 0 && (
                <p className="text-[#22c55e] text-[10px] leading-none mb-1">
                  {walmartVsAmazonPct}% cheaper per unit than Amazon
                </p>
              )}
              <p className="text-[10px] text-white/30 mt-2">{checkedLabel}</p>
            </>
          ) : (
            <>
              <p className="text-[#475569] text-xs mb-1">Unavailable</p>
              <span className="text-[#475569] text-xs">Search →</span>
              <p className="text-[10px] text-white/30 mt-2">{checkedLabel}</p>
            </>
          )}
        </a>
      </div>

      <div className="mt-3 flex gap-2 w-full overflow-hidden">
        {(["amazon", "walmart"] as const).map((store) => {
          const available = store === "amazon" ? effectiveAmazon.price !== null : effectiveWalmart.price !== null;
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
  const [submissionMode, setSubmissionMode] = useState<string>("text");

  useEffect(() => {
    const controller = new AbortController();

    const excluded = sessionStorage.getItem("slashcart_excluded");
    if (excluded) {
      try { setExcludedItems(JSON.parse(excluded)); } catch {}
    }

    const rawReceiptTotal = sessionStorage.getItem("slashcart_receipt_total");
    const rawReceiptStore = sessionStorage.getItem("slashcart_receipt_store");
    const rawMode = sessionStorage.getItem("slashcart_mode");
    if (rawReceiptTotal) { const n = parseFloat(rawReceiptTotal); if (!isNaN(n)) setReceiptTotal(n); }
    if (rawReceiptStore) setReceiptStore(rawReceiptStore);
    if (rawMode) setSubmissionMode(rawMode);

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
  const isTextMode = submissionMode === "text";

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
      const manualStore = storeSelections[i];
      // Without a manual override, skip items where both stores cost more than pricePaid
      if (!manualStore) {
        const { amazonCheapest, walmartCheapest } = getWinners(item);
        if (item.pricePaid && item.pricePaid > 0 && !amazonCheapest && !walmartCheapest) return;
      }
      const store = manualStore ?? defaultStore(item);
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
  const walmartCartUrl = allLoaded ? (buildWalmartCartUrl(walmartSelectedItems) ?? "https://www.walmart.com/cart") : "https://www.walmart.com/cart";

  // Cart total matches exactly what's shown in the checkout breakdown
  const slashcartTotal = round(amazonSelectedTotal + walmartSelectedTotal);
  const foundCount = allLoaded
    ? (pricedItems.filter(Boolean) as PricedItem[]).filter(
        (item) => item.amazon.price !== null || item.walmart.price !== null
      ).length
    : 0;
  const totalCount = groceryItems.length;

  // Savings-only totals: include only items with positive PPU-normalized savings
  // (mirrors the per-item "Save $X vs. shelf price" calculation).
  const savingsEntries = allLoaded
    ? (pricedItems.filter(Boolean) as PricedItem[])
        .map((item) => {
          const { amazonCheapest } = getWinners(item);
          const recPrice = amazonCheapest ? item.amazon.price : item.walmart.price;
          const recProductName = amazonCheapest ? item.amazon.productName : item.walmart.productName;
          return { item, savings: computeSavings(item.pricePaid, item.quantity, item.unit, recPrice, recProductName) };
        })
        .filter(({ savings }) => savings.amount !== null && savings.amount > 0)
    : [];
  // For text-mode items, savings = raw price difference (baseline vs. online price).
  // PPU normalization is misleading when the user typed a name without specifying a size.
  const textSavingsEntries = isTextMode && allLoaded
    ? (pricedItems.filter(Boolean) as PricedItem[]).map((item) => {
        const { amazonCheapest } = getWinners(item);
        const recPrice = amazonCheapest ? item.amazon.price : item.walmart.price;
        const amount = recPrice !== null && item.pricePaid != null && item.pricePaid > 0
          ? item.pricePaid - recPrice
          : null;
        return { item, amount };
      }).filter(({ amount }) => amount !== null && amount > 0)
    : [];

  const pantryReceiptTotal = allLoaded
    ? round((pricedItems.filter(Boolean) as PricedItem[]).reduce(
        (s, item) => s + (item.pricePaid && item.pricePaid > 0 ? item.pricePaid : 0), 0
      ))
    : 0;
  const totalReceiptSavings = allLoaded && pantryReceiptTotal > 0 && savingsEntries.length > 0
    ? round(savingsEntries.reduce((s, { savings }) => s + (savings.amount ?? 0), 0))
    : 0;
  const savingsPct = pantryReceiptTotal > 0
    ? Math.round((totalReceiptSavings / pantryReceiptTotal) * 100)
    : 0;

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

      {allLoaded && isTextMode ? (
        <div className="mb-5 rounded-xl bg-[#0d2e1a] border border-[#22c55e]/40 px-5 py-4">
          <p className="text-[#94a3b8] text-sm">
            We compared{" "}
            <span className="text-[#e2e8f0] font-semibold">{totalCount}</span>
            {" "}pantry item{totalCount !== 1 ? "s" : ""} across Amazon and Walmart.
          </p>
          {textSavingsEntries.length > 0 && (
            <p className="text-[#94a3b8] text-sm mt-1">
              Found lower prices on{" "}
              <span className="text-[#22c55e] font-semibold">{textSavingsEntries.length}</span>
              {" "}of them.
            </p>
          )}
        </div>
      ) : allLoaded && pantryReceiptTotal > 0 ? (
        <div className="mb-5 rounded-xl bg-[#0d2e1a] border border-[#22c55e]/40 px-5 py-5">
          <div className="mb-4 space-y-1">
            <p className="text-[#94a3b8] text-sm">
              You spent{" "}
              <span className="text-[#e2e8f0] font-semibold">${pantryReceiptTotal.toFixed(2)}</span>
              {" "}on{" "}
              <span className="text-[#e2e8f0] font-semibold">{totalCount}</span>
              {" "}pantry items
              {receiptStore ? <> at <span className="text-[#e2e8f0] font-semibold">{receiptStore}</span></> : ""}.
            </p>
            {totalReceiptSavings > 0 && (
              <p className="text-[#94a3b8] text-sm">
                We found{" "}
                <span className="text-[#22c55e] font-semibold">${totalReceiptSavings.toFixed(2)}</span>
                {" "}in savings on{" "}
                <span className="text-[#e2e8f0] font-semibold">{savingsEntries.length}</span>
                {" "}of them —{" "}
                <span className="text-[#22c55e] font-semibold">{savingsPct}% back</span>.
              </p>
            )}
          </div>
          {totalReceiptSavings > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">💰</span>
              <div>
                <p className="text-[#94a3b8] text-xs uppercase tracking-wide font-medium">Save on your next shop</p>
                <p className="text-[#22c55e] text-4xl font-bold leading-tight">${totalReceiptSavings.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <p className="text-[#22c55e] text-sm font-medium">✓ You got good prices on all these items</p>
          )}
          {receiptTotal !== null && (
            <p className="text-white/30 text-xs mt-4">
              ${receiptTotal.toFixed(2)} total receipt
              {receiptStore ? ` at ${receiptStore}` : ""}
              {" "}— fresh items and items not found online excluded
            </p>
          )}
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

      {allLoaded && (
        <FeedbackForm
          itemNames={groceryItems.map((i) => i.name)}
          totalSavings={totalReceiptSavings}
        />
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
                isTextMode={isTextMode}
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
                <p className="text-[#475569] text-xs">
                  Add Walmart items to your cart using the Buy → links above, then checkout on Walmart.
                </p>
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
