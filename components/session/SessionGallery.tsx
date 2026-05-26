"use client";

import dynamic from "next/dynamic";
import type { Receipt as ReceiptData } from "@/lib/store";

const ReceiptGalleryScene = dynamic(
  () => import("./three/Scene").then((mod) => mod.ReceiptGalleryScene),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-[12px] tracking-wider text-[color:var(--color-muted)]">
          Preparing receipt gallery...
        </p>
      </div>
    ),
  },
);

export function SessionGallery({ receipts }: { receipts: ReceiptData[] }) {
  if (receipts.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <p className="text-[12px] tracking-wider text-[color:var(--color-muted)]">
          No receipts in this session.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative overflow-hidden">
      <ReceiptGalleryScene receipts={receipts} />
    </div>
  );
}
