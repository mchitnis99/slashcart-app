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
    <div className="max-w-2xl mx-auto w-full mb-4">
      <p className="text-[#22c55e] text-[10px] font-semibold uppercase tracking-wide mb-1.5 px-1">
        Here&apos;s what a result looks like:
      </p>
      <div className="rounded-lg border border-[#22c55e]/30 bg-[#0d1f0d] px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[#64748b] text-[10px] uppercase tracking-wide leading-none mb-0.5">Example · Heinz Ketchup</p>
          <p className="text-[#22c55e] text-sm font-bold leading-tight">Save 30% on Amazon</p>
          <p className="text-[#94a3b8] text-xs mt-0.5">Store $0.29/oz → Amazon $0.20/oz</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[#22c55e] font-bold text-base leading-none">$0.20/oz</p>
          <p className="text-[#94a3b8] text-[10px] mt-0.5">$2.79 · 14 oz</p>
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
          Find out what you overpaid — and what to order on Amazon instead.
        </h1>
        <p className="text-[#94a3b8] text-base sm:text-lg max-w-lg mx-auto">
          Got a grocery receipt? Find out what you overpaid — and what to order on Amazon instead.
        </p>
      </div>

      <ExampleResultCard />

      <GroceryInput />
    </main>
  );
}
