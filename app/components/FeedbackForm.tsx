"use client";

import { useState, useEffect } from "react";

const LS_KEY = "slashcart_feedback_submitted";

export default function FeedbackForm({
  itemNames,
  totalSavings,
}: {
  itemNames: string[];
  totalSavings: number;
}) {
  const [hidden, setHidden] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(LS_KEY)) {
      setHidden(true);
    }
  }, []);

  if (hidden) return null;

  if (submitted) {
    return (
      <div className="mb-4 rounded-xl border border-[#22c55e]/30 bg-[#0d1830] px-4 py-4 text-center">
        <p className="text-[#22c55e] font-medium text-sm">✓ Thanks! We'll be in touch.</p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setError("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Please enter a valid email address."); return; }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          feedback: feedback.trim() || null,
          items_searched: itemNames,
          total_savings: totalSavings,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit.");
      localStorage.setItem(LS_KEY, "1");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[#334155] bg-[#1a2d3f] px-4 py-4">
      <h3 className="text-white font-semibold text-base mb-0.5">How did we do?</h3>
      <p className="text-[#94a3b8] text-xs mb-3">
        Leave your email and we'll follow up to make sure you found real savings.
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          disabled={loading}
          className="w-full rounded-lg border border-[#334155] bg-[#111827] text-[#e2e8f0] placeholder-[#475569] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#22c55e] transition disabled:opacity-50"
        />
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Anything we missed? e.g. couldn't find almond milk, wrong size for paper towels..."
          rows={2}
          disabled={loading}
          className="w-full rounded-lg border border-[#334155] bg-[#111827] text-[#e2e8f0] placeholder-[#475569] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#22c55e] transition disabled:opacity-50"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-lg border border-[#334155] hover:border-[#475569] bg-[#0d1830] disabled:opacity-50 disabled:cursor-not-allowed text-[#e2e8f0] text-sm font-medium transition-colors"
        >
          {loading ? "Sending…" : "Send feedback"}
        </button>
      </form>
    </div>
  );
}
