"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UpgradeWallModal } from "@/components/dashboard/UpgradeWallModal";
import type { UsageType } from "@/lib/usage";

interface Receipt {
  id: string;
  amount: number | null;
  vendor: string | null;
  category: "deductible" | "non_deductible" | "uncategorized";
  receipt_date: string | null;
  signed_url: string | null;
  created_at: string;
}

const CATEGORY_LABEL: Record<Receipt["category"], string> = {
  deductible: "Deductible",
  non_deductible: "Not deductible",
  uncategorized: "Uncategorized",
};

const CATEGORY_VARIANT: Record<Receipt["category"], "success" | "default" | "warning"> = {
  deductible: "success",
  non_deductible: "default",
  uncategorized: "warning",
};

export default function DocumentsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeWall, setUpgradeWall] = useState<{ type: UsageType; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadReceipts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dashboard/receipts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load receipts.");
        return;
      }
      setReceipts(data.receipts);
    } catch {
      setError("Network error loading receipts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  async function uploadFile(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/dashboard/receipts", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.code === "LIMIT_REACHED") {
          setUpgradeWall({ type: data.type, message: data.message });
          return;
        }
        setError(data.error || "Upload failed.");
        return;
      }
      await loadReceipts();
    } catch {
      setError("Network error during upload.");
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteReceipt(id: string) {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/dashboard/receipts/${id}`, { method: "DELETE" });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Documents</h1>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
          isDragging ? "border-[#00FF85] bg-[#00FF85]/5" : "border-slate-700 hover:border-slate-600"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
        {isUploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-[#00FF85]" />
            <p className="text-sm text-slate-300">Uploading and reading receipt...</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-slate-500" />
            <p className="text-sm text-slate-300">Drag & drop a receipt image, or click to browse</p>
            <p className="text-xs text-slate-500">JPEG, PNG, WEBP, or HEIC — max 8MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : receipts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-400">
            No receipts uploaded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {receipts.map((receipt) => (
            <Card key={receipt.id} className="overflow-hidden">
              <div className="relative aspect-square bg-slate-950">
                {receipt.signed_url ? (
                  <Image
                    src={receipt.signed_url}
                    alt={receipt.vendor ?? "Receipt"}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-600">No preview</div>
                )}
                <button
                  onClick={() => deleteReceipt(receipt.id)}
                  aria-label="Delete receipt"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-slate-300 hover:bg-red-900/80 hover:text-red-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <CardContent className="space-y-1 p-3">
                <p className="truncate text-sm font-medium text-slate-200">{receipt.vendor ?? "Unknown vendor"}</p>
                <p className="text-sm text-slate-400">
                  {receipt.amount != null ? `₱${receipt.amount.toLocaleString()}` : "Amount unknown"}
                </p>
                <Badge variant={CATEGORY_VARIANT[receipt.category]}>{CATEGORY_LABEL[receipt.category]}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UpgradeWallModal
        open={Boolean(upgradeWall)}
        onClose={() => setUpgradeWall(null)}
        type={upgradeWall?.type ?? null}
        message={upgradeWall?.message ?? null}
      />
    </div>
  );
}
