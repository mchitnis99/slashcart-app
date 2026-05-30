"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function GroceryInput() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Please paste a grocery list or upload a photo.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, string> = { text: text.trim() };

      if (imageFile) {
        const base64 = await fileToBase64(imageFile);
        body.image = base64;
        body.imageMediaType = imageFile.type;
      }

      const res = await fetch("/api/parse-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to parse grocery list.");
      }

      const { items, excluded_items } = await res.json();
      sessionStorage.setItem("slashcart_items", JSON.stringify(items));
      sessionStorage.setItem("slashcart_excluded", JSON.stringify(excluded_items ?? []));

      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type your grocery list here..."
          rows={8}
          className="w-full rounded-xl border border-slate-600 bg-[#0f1f3d] text-[#e2e8f0] placeholder-[#475569] p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#22c55e] transition"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#1e3050]" />
        <span className="text-[#475569] text-xs uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-[#1e3050]" />
      </div>

      {imagePreview ? (
        <div className="relative rounded-xl overflow-hidden border border-[#1e3050] bg-[#142036]">
          <img
            src={imagePreview}
            alt="Grocery list preview"
            className="w-full max-h-56 object-contain"
          />
          <button
            type="button"
            onClick={removeImage}
            className="absolute top-2 right-2 bg-[#0b1426]/80 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs transition"
            aria-label="Remove image"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-full rounded-xl border border-dashed py-6 text-sm flex flex-col items-center gap-2 transition ${
            isDragging
              ? "border-[#22c55e] bg-[#0f2030] text-[#22c55e]"
              : "border-[#1e3050] bg-[#142036] hover:border-[#22c55e] hover:bg-[#0f2030] text-[#94a3b8] hover:text-[#22c55e]"
          }`}
        >
          <span className="text-2xl">📷</span>
          <span>Or upload a photo of your grocery list or receipt</span>
          <span className="text-xs text-[#475569]">JPG, PNG, WEBP, HEIC supported</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed text-[#0b1426] font-semibold text-base transition-colors"
      >
        {loading ? "Finding best prices…" : "Find Best Prices →"}
      </button>
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
