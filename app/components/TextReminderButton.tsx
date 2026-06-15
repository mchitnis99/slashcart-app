"use client";

const SMS_HREF = `sms:?body=${encodeURIComponent(
  "Check this out next time you're grocery shopping: https://app.slashcart.app"
)}`;

export default function TextReminderButton() {
  function logClick() {
    void fetch("/api/reminder-click", { method: "POST" });
  }

  return (
    <div className="max-w-md mx-auto w-full mb-6 sm:mb-8 text-center">
      <p className="text-[#64748b] text-sm mb-3">Not at the store right now? Save it for later.</p>
      <a
        href={SMS_HREF}
        onClick={logClick}
        className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10 font-semibold text-sm px-6 py-2.5 transition-colors"
      >
        📱 Text me the link — I&apos;ll use it next time I shop
      </a>
    </div>
  );
}
