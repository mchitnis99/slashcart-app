"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import TextReminderButton from "./TextReminderButton";

type CaptureMode = "receipt" | "shelf" | "product";

export default function GroceryInput() {
  const router = useRouter();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const shelfInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptPreviews, setReceiptPreviews] = useState<string[]>([]);
  const [shelfFiles, setShelfFiles] = useState<File[]>([]);
  const [shelfPreviews, setShelfPreviews] = useState<string[]>([]);
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [productPreviews, setProductPreviews] = useState<string[]>([]);
  const [dragTarget, setDragTarget] = useState<CaptureMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [showHangTight, setShowHangTight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hangTightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const photoMode: CaptureMode | null =
    receiptFiles.length > 0 ? "receipt" : shelfFiles.length > 0 ? "shelf" : productFiles.length > 0 ? "product" : null;
  const activeFiles = photoMode === "receipt" ? receiptFiles : photoMode === "shelf" ? shelfFiles : photoMode === "product" ? productFiles : [];

  useEffect(() => {
    return () => {
      if (hangTightTimerRef.current) clearTimeout(hangTightTimerRef.current);
    };
  }, []);

  async function captureFiles(mode: CaptureMode, files: File[]) {
    if (files.length === 0) return;
    const previews = await Promise.all(files.map(fileToDataUrl));
    if (mode === "receipt") {
      setReceiptFiles((prev) => [...prev, ...files]);
      setReceiptPreviews((prev) => [...prev, ...previews]);
    } else if (mode === "shelf") {
      setShelfFiles((prev) => [...prev, ...files]);
      setShelfPreviews((prev) => [...prev, ...previews]);
    } else {
      setProductFiles((prev) => [...prev, ...files]);
      setProductPreviews((prev) => [...prev, ...previews]);
    }
  }

  function removeImage(mode: CaptureMode, index: number) {
    if (mode === "receipt") {
      setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
      setReceiptPreviews((prev) => prev.filter((_, i) => i !== index));
    } else if (mode === "shelf") {
      setShelfFiles((prev) => prev.filter((_, i) => i !== index));
      setShelfPreviews((prev) => prev.filter((_, i) => i !== index));
    } else {
      setProductFiles((prev) => prev.filter((_, i) => i !== index));
      setProductPreviews((prev) => prev.filter((_, i) => i !== index));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && activeFiles.length === 0) {
      setError("Please type your grocery list.");
      return;
    }
    setError(null);
    setLoading(true);
    setPhotoProgress(0);
    setShowHangTight(false);

    hangTightTimerRef.current = setTimeout(() => setShowHangTight(true), 2000);

    void fetch("/api/submission-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: photoMode ?? "text" }),
    });

    try {
      let items: unknown[] = [];
      let excluded_items: unknown[] = [];
      let receipt_total: number | null = null;
      let receipt_store: string | null = null;

      if (photoMode) {
        type ImageResult = {
          items?: unknown[];
          excluded_items?: unknown[];
          receipt_total?: number | null;
          receipt_store?: string | null;
        };
        const results: ImageResult[] = [];
        for (let i = 0; i < activeFiles.length; i++) {
          setPhotoProgress(i + 1);
          const file = activeFiles[i];
          const compressed = await compressImage(file);
          const base64 = await fileToBase64(compressed);
          const res = await fetch("/api/parse-list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: base64,
              imageMediaType: compressed.type,
              mode: photoMode,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const message =
              typeof data?.error === "string" ? data.error
              : typeof data?.error?.message === "string" ? data.error.message
              : typeof data?.message === "string" ? data.message
              : "Failed to read photo.";
            throw new Error(message);
          }
          results.push(await res.json() as ImageResult);
          if (i < activeFiles.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        items = results.flatMap((r) => r.items ?? []);
        excluded_items = results.flatMap((r) => r.excluded_items ?? []);
        if (photoMode === "receipt" && results.length > 0) {
          receipt_total = results[0].receipt_total ?? null;
          receipt_store = results[0].receipt_store ?? null;
        }
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
      sessionStorage.setItem("slashcart_mode", photoMode ?? "text");

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
    loading && photoMode && photoProgress > 0
      ? `Reading ${photoMode === "receipt" ? "receipt" : photoMode === "shelf" ? "shelf label" : "photo"} ${photoProgress} of ${activeFiles.length}…`
      : photoMode
        ? "Reading your photo…"
        : "Reading your list…";

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-3">

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type any grocery items — e.g. Skippy peanut butter, Heinz ketchup, Cheerios..."
        rows={4}
        disabled={loading}
        className="w-full rounded-xl border-2 border-[#22c55e]/40 bg-[#0b1f0f]/60 text-[#e2e8f0] placeholder-[#475569] p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#22c55e] transition disabled:opacity-50 disabled:cursor-not-allowed"
      />

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
            Reading your list…
          </>
        ) : (
          "Find Best Prices →"
        )}
      </button>

      <TextReminderButton />

      {showHangTight && (
        <p className="text-[#475569] text-xs text-center animate-pulse">
          This takes about 30 seconds for new items — hang tight!
        </p>
      )}
    </form>
  );
}

function PhotoCaptureZone({
  emoji,
  label,
  subtext,
  dropzonePrompt,
  dropzoneSubtext,
  files,
  previews,
  loading,
  isDragging,
  inputRef,
  primary,
  onCapture,
  onRemove,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  emoji: string;
  label: string;
  subtext: string;
  dropzonePrompt: string;
  dropzoneSubtext: string;
  files: File[];
  previews: string[];
  loading: boolean;
  isDragging: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  primary?: boolean;
  onCapture: (files: File[]) => void;
  onRemove: (index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <p className={primary ? "text-[#e2e8f0] text-sm font-semibold" : "text-white text-xs font-medium"}>
          {emoji} {label}
        </p>
        {primary && (
          <span className="text-[10px] font-bold uppercase tracking-wide bg-[#22c55e] text-[#0b1426] px-2 py-0.5 rounded-full">
            Recommended
          </span>
        )}
      </div>
      <p className={primary ? "text-[#94a3b8] text-xs mb-2" : "text-slate-300 text-xs mb-2"}>{subtext}</p>

      {previews.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {previews.map((preview, i) => (
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
                    onClick={() => onRemove(i)}
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
              onClick={() => inputRef.current?.click()}
              className="text-xs text-[#22c55e] hover:text-[#16a34a] transition"
            >
              + Add more photos
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !loading && inputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          disabled={loading}
          className={`w-full rounded-xl border-2 text-sm flex flex-col items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${
            primary ? "py-5" : "py-4"
          } ${
            isDragging
              ? "border-[#22c55e] bg-[#0f2030] text-[#22c55e]"
              : primary
              ? "border-[#22c55e]/80 bg-[#0d2416] hover:border-[#22c55e] hover:bg-[#0f2030] text-[#94a3b8] hover:text-[#22c55e]"
              : "border-[#3b82f6]/60 bg-[#0d1b33] hover:border-[#3b82f6] hover:bg-[#0f2030] text-[#94a3b8] hover:text-[#3b82f6]"
          }`}
        >
          <span className={primary ? "text-2xl" : "text-xl"}>{emoji}</span>
          <span className="font-medium text-center px-4">{dropzonePrompt}</span>
          <span className="text-xs text-[#475569] text-center px-4">{dropzoneSubtext}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
        multiple
        onChange={(e) => {
          const selected = Array.from(e.target.files ?? []);
          onCapture(selected);
          if (inputRef.current) inputRef.current.value = "";
        }}
        className="hidden"
      />
    </div>
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
