"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GroceryInput() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
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

  async function captureFiles(files: File[]) {
    if (files.length === 0) return;
    const previews = await Promise.all(files.map(fileToDataUrl));
    setImageFiles((prev) => [...prev, ...files]);
    setImagePreviews((prev) => [...prev, ...previews]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    void captureFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    const files = Array.from(e.dataTransfer.files ?? []);
    void captureFiles(files);
  }

  function removeImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && imageFiles.length === 0) {
      setError("Please upload a photo or paste a grocery list.");
      return;
    }
    setError(null);
    setLoading(true);
    setShowHangTight(false);

    hangTightTimerRef.current = setTimeout(() => setShowHangTight(true), 2000);

    try {
      let items: unknown[] = [];
      let excluded_items: unknown[] = [];
      let receipt_total: number | null = null;
      let receipt_store: string | null = null;

      if (imageFiles.length > 0) {
        const results = await Promise.all(
          imageFiles.map(async (file) => {
            const compressed = await compressImage(file);
            const base64 = await fileToBase64(compressed);
            const res = await fetch("/api/parse-list", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                image: base64,
                imageMediaType: compressed.type,
                mode: "product",
              }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              const message =
                typeof data?.error === "string" ? data.error
                : typeof data?.error?.message === "string" ? data.error.message
                : typeof data?.message === "string" ? data.message
                : "Failed to read product label.";
              throw new Error(message);
            }
            return res.json() as Promise<{
              items?: unknown[];
              excluded_items?: unknown[];
              receipt_total?: number | null;
              receipt_store?: string | null;
            }>;
          })
        );
        items = results.flatMap((r) => r.items ?? []);
        excluded_items = results.flatMap((r) => r.excluded_items ?? []);
      } else {
        const res = await fetch("/api/parse-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const message =
            typeof data?.error === "string" ? data.error
            : typeof data?.error?.message === "string" ? data.error.message
            : typeof data?.message === "string" ? data.message
            : "Failed to parse grocery list.";
          throw new Error(message);
        }
        const parsed = await res.json() as {
          items?: unknown[];
          excluded_items?: unknown[];
          receipt_total?: number | null;
          receipt_store?: string | null;
        };
        items = parsed.items ?? [];
        excluded_items = parsed.excluded_items ?? [];
        receipt_total = parsed.receipt_total ?? null;
        receipt_store = parsed.receipt_store ?? null;
      }

      sessionStorage.setItem("slashcart_items", JSON.stringify(items));
      sessionStorage.setItem("slashcart_excluded", JSON.stringify(excluded_items));
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

  const loadingLabel =
    imageFiles.length > 1
      ? `Reading ${imageFiles.length} photos…`
      : imageFiles.length === 1
        ? "Reading your photo…"
        : "Reading your list…";

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">

      {/* Primary: product photo upload */}
      <div>
        <p className="text-[#e2e8f0] text-sm font-semibold mb-1">Photograph items in your cart</p>
        <p className="text-[#94a3b8] text-xs mb-3">
          See exactly how much you overpaid — and where to buy cheaper next time.
        </p>

        {imagePreviews.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {imagePreviews.map((preview, i) => (
                <div
                  key={i}
                  className="relative rounded-lg overflow-hidden border border-[#1e3050] bg-[#142036] w-20 h-20 shrink-0"
                >
                  <img
                    src={preview}
                    alt={`Item ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {!loading && (
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 bg-[#0b1426]/80 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] transition"
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!loading && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-[#22c55e] hover:text-[#16a34a] transition"
              >
                + Add more photos
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
            <span className="font-medium">Tap to photograph each item, or drag photos here</span>
            <span className="text-xs text-[#475569]">One photo per item — we'll read the label for brand, size, and variant</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
        multiple
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX = 1200;
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
        0.8
      );
    };

    img.src = url;
  });
}
