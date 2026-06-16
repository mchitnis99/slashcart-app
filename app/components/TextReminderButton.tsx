"use client";

import { useState } from "react";

const SHARE_URL = "https://app.slashcart.app";

export default function TextReminderButton() {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    void fetch("/api/reminder-click", { method: "POST" });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "SlashCart",
          text: "Check this out next time you're grocery shopping",
          url: SHARE_URL,
        });
      } catch {
        // user dismissed the share sheet — no action needed
      }
    } else {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="max-w-md mx-auto w-full mb-6 sm:mb-8 text-center">
      <p className="text-[#64748b] text-sm mb-3">Not at the store right now? Save it for later.</p>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10 font-semibold text-sm px-6 py-2.5 transition-colors"
      >
        {copied ? "Copied!" : "📱 Share the link — I'll use it next time I shop"}
      </button>
    </div>
  );
}
