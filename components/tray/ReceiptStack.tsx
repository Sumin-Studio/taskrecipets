"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { Receipt } from "./Receipt";

export function ReceiptStack() {
  const receipts = useStore((s) => s.receipts);

  // newest first, render up to last 12 for performance
  const recent = [...receipts].slice(-12).reverse();

  return (
    <div className="relative w-[420px] h-[640px]">
      <AnimatePresence initial={false}>
        {recent.map((r, idx) => (
          <motion.div
            key={r.id}
            initial={{ y: -300, opacity: 0, rotate: r.rotation - 6 }}
            animate={{
              y: idx * 6,
              opacity: 1,
              rotate: r.rotation + (idx * 0.4),
              scale: 1 - idx * 0.012,
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 140,
              damping: 16,
              mass: 0.6,
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 100 - idx,
              transformOrigin: "top center",
              filter: idx === 0
                ? "drop-shadow(0 10px 18px rgba(0,0,0,0.18))"
                : `drop-shadow(0 ${4 + idx}px 6px rgba(0,0,0,0.12))`,
            }}
          >
            <Receipt receipt={r} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
