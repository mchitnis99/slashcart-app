"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GroceryInput() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showHangTight, setShowHangTight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hangTightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hangTightTimerRef.current) clearTimeout(hangTightTimerRef.current);
    };
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) captureFile(file);
  }

  function captureFile(file: File) {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) captureFile(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !imageFile) {
      setError("Please upload a receipt or paste a grocery list.");
      return;
    }
    setError(null);
    setLoading(true);
    setShowHangTight(false);

    hangTightTimerRef.current = setTimeout(() => setShowHangTight(true), 2000);

    try {
      const body: Record<string, string> = { text: text.trim() };

      if (imageFile) {
        const compressed = await compressImage(imageFile);
        const base64 = await fileToBase64(compressed);
        body.image = base64;
        body.imageMediaType = compressed.type;
      }

      const res = await fetch("/api/parse-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // `error` can be a plain string (our API) or an object like
        // { code, message } (hosting platform errors, e.g. payload-too-large
        // on large mobile receipt photos) — extract a string in either case.
        const message =
          typeof data?.error === "string" ? data.error
          : typeof data?.error?.message === "string" ? data.error.message
          : typeof data?.message === "string" ? data.message
          : "Failed to parse grocery list.";
        throw new Error(message);
      }

      const { items, excluded_items, receipt_total, receipt_store } = await res.json();
      sessionStorage.setItem("slashcart_items", JSON.stringify(items));
      sessionStorage.setItem("slashcart_excluded", JSON.stringify(excluded_items ?? []));
      sessionStorage.setItem("slashcart_receipt_total", receipt_total != null ? String(receipt_total) : "");
      sessionStorage.setItem("slashcart_receipt_store", receipt_store ?? "");

      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (hangTightTimerRef.current) clearTimeout(hangTightTimerRef.current);
      setLoading(false);
      setShowHangTight(false);
    }
  }

  const loadingLabel = imageFile ? "Reading your receipt…" : "Reading your list…";

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">

      {/* Primary: receipt upload */}
      <div>
        <p className="text-[#e2e8f0] text-sm font-semibold mb-1">Upload your receipt</p>
        <p className="text-[#94a3b8] text-xs mb-3">
          See exactly how much you overpaid — and where to buy cheaper next time.
        </p>
        {imagePreview ? (
          <div className="relative rounded-xl overflow-hidden border border-[#1e3050] bg-[#142036]">
            <img
              src={imagePreview}
              alt="Receipt preview"
              className="w-full max-h-64 object-contain"
            />
            {!loading && (
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-2 right-2 bg-[#0b1426]/80 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs transition"
                aria-label="Remove image"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !loading && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={loading}
            className={`w-full rounded-xl border border-dashed py-8 text-sm flex flex-col items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${
              isDragging
                ? "border-[#22c55e] bg-[#0f2030] text-[#22c55e]"
                : "border-[#22c55e]/40 bg-[#0d2416] hover:border-[#22c55e] hover:bg-[#0f2030] text-[#94a3b8] hover:text-[#22c55e]"
            }`}
          >
            <span className="text-3xl">📷</span>
            <span className="font-medium">Tap to upload or drag your receipt here</span>
            <span className="text-xs text-[#475569]">JPG, PNG, WEBP, HEIC supported</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#1e3050]" />
        <span className="text-[#475569] text-xs uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-[#1e3050]" />
      </div>

      {/* Secondary: text input */}
      <div>
        <p className="text-[#64748b] text-sm mb-2">Type your grocery list</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your grocery list — we'll find savings on pantry staples, packaged goods, and household supplies. Fresh produce, meat, and dairy not included."
          rows={6}
          disabled={loading}
          className="w-full rounded-xl border border-slate-600 bg-[#0f1f3d] text-[#e2e8f0] placeholder-[#475569] p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#22c55e] transition disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <p className="mt-1.5 text-xs text-white/30 px-1">
          Works best for: canned goods, dry goods, cleaning supplies, personal care, and paper products
        </p>
        <p className="mt-1 text-xs text-yellow-400/70 px-1">
          💡 Tip: The more specific, the better — include brand, size, and variant (e.g. &ldquo;Tonnino Yellowfin Tuna Fillets Olive Oil 6.7oz&rdquo;). Size matters most for accurate matches.
        </p>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-80 disabled:cursor-not-allowed text-[#0b1426] font-semibold text-base transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
            </svg>
            {loadingLabel}
          </>
        ) : (
          "Find Best Prices →"
        )}
      </button>

      {showHangTight && (
        <p className="text-[#475569] text-xs text-center animate-pulse">
          This takes about 30 seconds for new items — hang tight!
        </p>
      )}
    </form>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File): Promise<File> {
  const ONE_MB = 1024 * 1024;
  if (file.size < ONE_MB) return Promise.resolve(file);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const name = file.name.replace(/\.[^.]+$/, ".jpg");
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.85
      );
    };

    img.src = url;
  });
}
