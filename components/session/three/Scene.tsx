"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { Receipt as ReceiptData } from "@/lib/store";
import { ReceiptPaper } from "./ReceiptPaper";

export function ReceiptGalleryScene({ receipts }: { receipts: ReceiptData[] }) {
  const receiptKey = useMemo(
    () => receipts.map((receipt) => receipt.id).join(":"),
    [receipts],
  );

  return <ReceiptGalleryCanvas key={receiptKey} receipts={receipts} />;
}

function ReceiptGalleryCanvas({ receipts }: { receipts: ReceiptData[] }) {
  const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set());

  const isReady = readyIds.size >= receipts.length;

  return (
    <>
      <Canvas
        className="absolute inset-0"
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 14]} fov={45} />
        <SceneContents
          receipts={receipts}
          onReceiptReady={(id) => {
            setReadyIds((current) => {
              if (current.has(id)) return current;
              const next = new Set(current);
              next.add(id);
              return next;
            });
          }}
        />
      </Canvas>

      {!isReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[color:var(--color-ground)]">
          <p className="text-[12px] tracking-wider text-[color:var(--color-muted)]">
            Preparing receipt gallery...
          </p>
        </div>
      )}
    </>
  );
}

function SceneContents({
  receipts,
  onReceiptReady,
}: {
  receipts: ReceiptData[];
  onReceiptReady: (id: string) => void;
}) {
  const positions = useMemo(() => layoutReceipts(receipts.length), [receipts.length]);

  return (
    <>
      <ambientLight intensity={1.35} />
      <directionalLight position={[3, 8, 5]} intensity={0.7} />
      <directionalLight position={[-2, 4, 2]} intensity={0.25} color="#fff8f0" />
      {receipts.map((receipt, index) => (
        <ReceiptPaper
          key={receipt.id}
          receipt={receipt}
          position={positions[index]}
          onReady={() => onReceiptReady(receipt.id)}
        />
      ))}
    </>
  );
}

function layoutReceipts(count: number): [number, number, number][] {
  const columns = Math.min(3, Math.max(1, count));
  const xGap = 5.1;
  const yGap = 7.3;
  const positions: [number, number, number][] = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const x = (col - (rowCount - 1) / 2) * xGap;
    const y = 4.2 - row * yGap;
    positions.push([x, y, index * 0.01]);
  }

  return positions;
}
