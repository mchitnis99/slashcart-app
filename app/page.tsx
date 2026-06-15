import { ClipboardList, ShoppingCart, TrendingDown } from "lucide-react";
import EmailReminder from "./components/EmailReminder";
import GroceryInput from "./components/GroceryInput";

function SlashCartLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 100"
      width="160"
      height="50"
      aria-label="SlashCart"
      role="img"
    >
      {/* Cart body */}
      <rect x="20" y="22" width="52" height="36" rx="6" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      {/* Cart handle */}
      <path d="M72 28 Q82 28 82 38" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      {/* Cart wheels */}
      <circle cx="30" cy="66" r="5.5" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      <circle cx="58" cy="66" r="5.5" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      {/* Lime slash through cart */}
      <line x1="62" y1="12" x2="28" y2="76" stroke="#C8F135" strokeWidth="4.5" strokeLinecap="round" />
      {/* SLASH wordmark */}
      <text x="102" y="48" fontFamily="'Bebas Neue', 'Arial Black', sans-serif" fontSize="36" fontWeight="700" letterSpacing="2" fill="#ffffff">SLASH</text>
      {/* CART wordmark */}
      <text x="102" y="80" fontFamily="'Bebas Neue', 'Arial Black', sans-serif" fontSize="36" fontWeight="700" letterSpacing="2" fill="#C8F135">CART</text>
    </svg>
  );
}

function ExampleResultCard() {
  return (
    <div className="max-w-2xl mx-auto w-full mb-6 sm:mb-8">
      <div className="rounded-xl border border-[#1e3050] bg-[#111827] px-3 py-3 sm:px-4 sm:py-4 overflow-hidden relative">
        <span className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-wide text-[#64748b] bg-[#1e3050] rounded px-1.5 py-0.5">
          Example
        </span>
        <div className="mb-3 min-w-0 pr-16">
          <p className="font-semibold text-white capitalize truncate">Heinz Ketchup</p>
          <p className="text-[#22c55e] text-lg font-bold leading-tight mt-1">
            Save 48% on Amazon
          </p>
          <p className="text-[#94a3b8] text-xs mt-0.5">
            Store price $0.12/oz → Amazon $0.07/oz
          </p>
          <p className="text-[#475569] text-xs mt-0.5">
            In store you&apos;ll pay $3.99
          </p>
        </div>

        <div className="grid grid-cols-1">
          {/* Amazon — best value */}
          <div className="rounded-lg p-3 border border-[#22c55e]/50 bg-[#0a2018] overflow-hidden">
            <div className="flex items-center gap-1.5 mb-2 min-w-0">
              <p className="text-[#94a3b8] text-xs font-medium shrink-0">Amazon</p>
              <span className="text-[9px] font-semibold text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/30 rounded px-1 py-0.5 leading-none shrink-0">
                Best value
              </span>
            </div>
            <div className="w-20 h-20 mb-2 rounded-md bg-[#1a2d3f]" />
            <p className="font-bold text-xl leading-none mb-0.5 text-[#22c55e]">
              $0.07/oz
            </p>
            <p className="text-[#94a3b8] text-xs leading-none mb-1">
              $2.09 · 32 oz
            </p>
            <p className="text-[#94a3b8] text-[10px] leading-none mb-1">
              Buy 32 oz for $2.09
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1 w-full overflow-x-hidden px-4 py-12 sm:py-20">
      <div className="text-center mb-7 sm:mb-10">
        <div className="mb-6 flex justify-center">
          <SlashCartLogo />
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-[#e2e8f0] leading-tight mb-3">
          Find out if Amazon&apos;s cheaper — before you buy
        </h1>
        <p className="text-[#94a3b8] text-base sm:text-lg max-w-lg mx-auto">
          We unlock the savings hidden in per-unit pricing across Amazon and Walmart — for every pantry item on your list in one click.
        </p>
      </div>

      <ExampleResultCard />

      <EmailReminder />

      <GroceryInput />

      <div className="mt-10 sm:mt-16 grid grid-cols-3 gap-3 sm:gap-6 max-w-xl mx-auto text-center px-2 sm:px-0">
        {[
          { icon: <ClipboardList className="w-8 h-8 text-[#4ade80]" />, label: "Paste or snap a list" },
          { icon: <ShoppingCart className="w-8 h-8 text-[#4ade80]" />, label: "Amazon & Walmart prices" },
          { icon: <TrendingDown className="w-8 h-8 text-[#4ade80]" />, label: "See what you save" },
        ].map(({ icon, label }) => (
          <div key={label} className="space-y-2">
            <div className="flex justify-center">{icon}</div>
            <div className="text-[#94a3b8] text-xs">{label}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
