import { ClipboardList, ShoppingCart, TrendingDown } from "lucide-react";
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

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1 w-full overflow-x-hidden px-4 py-12 sm:py-20">
      <div className="text-center mb-7 sm:mb-10">
        <div className="mb-6 flex justify-center">
          <SlashCartLogo />
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-[#e2e8f0] leading-tight mb-3">
          Let&apos;s Slash Your Grocery Bill
        </h1>
        <p className="text-[#22c55e] font-semibold text-lg sm:text-xl mb-3">
          Most people overpay because they only ever look at shelf prices.
        </p>
        <p className="text-[#94a3b8] text-base sm:text-lg max-w-lg mx-auto">
          We unlock the savings hidden in per-unit pricing across Amazon and Walmart — for your entire list in one click.
        </p>
      </div>

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
