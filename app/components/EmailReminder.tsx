"use client";

import { useState } from "react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailReminder() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to save email.");
      setStatus("success");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="max-w-md mx-auto w-full mb-6 sm:mb-8 text-center">
        <p className="text-[#22c55e] text-sm font-medium">Got it! We&apos;ll remind you.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto w-full mb-6 sm:mb-8">
      <p className="text-[#94a3b8] text-sm text-center mb-2">Get a reminder next time you shop</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={status === "loading"}
          className="flex-1 rounded-xl border-2 border-[#3b5278] bg-[#0f1f3d]/60 text-[#e2e8f0] placeholder-[#475569] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e] transition disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-80 disabled:cursor-not-allowed text-[#0b1426] font-semibold text-sm px-4 transition-colors whitespace-nowrap"
        >
          {status === "loading" ? "Saving…" : "Remind me"}
        </button>
      </form>
      {error && <p className="text-red-400 text-xs mt-1.5 text-center">{error}</p>}
    </div>
  );
}
