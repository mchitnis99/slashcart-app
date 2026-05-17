import GroceryInput from "./components/GroceryInput";

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1 px-4 py-12 sm:py-20">
      <div className="text-center mb-10">
        <div className="mb-6">
          <span className="text-[#22c55e] font-bold text-3xl sm:text-4xl tracking-tight">
            /cart
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-[#e2e8f0] leading-tight mb-4">
          Stop overpaying for
          <br />
          <span className="text-[#22c55e]">groceries.</span>
        </h1>
        <p className="text-[#94a3b8] text-base sm:text-lg max-w-md mx-auto">
          Paste or snap your grocery list. We compare real-time prices across
          Walmart, Whole Foods, Target, Instacart, and more.
        </p>
      </div>

      <GroceryInput />

      <div className="mt-16 grid grid-cols-3 gap-6 max-w-xl mx-auto text-center">
        {[
          { icon: "⚡", label: "Instant comparison" },
          { icon: "🏪", label: "5+ major stores" },
          { icon: "💸", label: "Save every week" },
        ].map(({ icon, label }) => (
          <div key={label} className="space-y-1">
            <div className="text-2xl">{icon}</div>
            <div className="text-[#94a3b8] text-xs">{label}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
