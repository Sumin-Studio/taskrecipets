"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AnyReceipt, Receipt as TaskReceipt } from "@/lib/store";
import { efficiency } from "@/lib/computeSquares";
import { PRINTER_TO_STACK_OFFSET } from "@/lib/trayLayout";
import { Receipt } from "@/components/tray/Receipt";
import {
  RECEIPT_CUT_ANIM_MS,
  RECEIPT_CUT_DELAY_MS,
} from "@/components/tray/ReceiptPrintReveal";
import { MegaReceiptStrip, type SessionStats } from "./MegaReceiptStrip";
import { SessionGallery } from "./SessionGallery";

export const SESSION_PRINT_START_DELAY_MS = 700;
/** After cut line — matches task receipt stack timing from cut visible */
const SESSION_STACK_AFTER_CUT_MS = RECEIPT_CUT_ANIM_MS + 380;

type MegaPhase = "wait" | "print" | "cut" | "landing" | "stacked";

export function SessionSummaryView({
  endedSession,
  receipts,
  onBack,
  onEndSession,
  backLabel = "← Back to app",
  title = "Session summary",
}: {
  endedSession: { startedAt: number; endedAt: number };
  receipts: AnyReceipt[];
  onBack: () => void;
  onEndSession?: () => void;
  backLabel?: string;
  title?: string;
}) {
  const [view, setView] = useState<"summary" | "gallery">("summary");
  const [megaPhase, setMegaPhase] = useState<MegaPhase>("wait");
  const [printComplete, setPrintComplete] = useState(false);
  const [showCut, setShowCut] = useState(false);

  const sessionTaskReceipts = useMemo(() => {
    return receipts
      .filter(
        (r): r is TaskReceipt =>
          r.kind !== "session" &&
          r.printedAt >= endedSession.startedAt &&
          r.printedAt <= endedSession.endedAt,
      )
      .sort((a, b) => a.printedAt - b.printedAt);
  }, [receipts, endedSession]);

  const megaSquares = useMemo(
    () => sessionTaskReceipts.flatMap((r) => r.squares ?? []),
    [sessionTaskReceipts],
  );

  const stats = useMemo<SessionStats>(() => {
    const totalActiveMs = sessionTaskReceipts.reduce(
      (sum, r) => sum + r.totalActiveMs,
      0,
    );
    const totalBreakMs = sessionTaskReceipts.reduce(
      (sum, r) => sum + r.totalBreakMs,
      0,
    );
    return {
      tasksCompleted: sessionTaskReceipts.length,
      totalActiveMs,
      totalBreakMs,
      totalMinutes: megaSquares.length,
      efficiencyPct: efficiency(megaSquares),
      durationMs: endedSession.endedAt - endedSession.startedAt,
    };
  }, [sessionTaskReceipts, megaSquares, endedSession]);

  const megaRotation = useMemo(
    () => ((endedSession.endedAt % 360) / 360 - 0.5) * 4,
    [endedSession.endedAt],
  );

  const megaInStack = megaPhase === "landing" || megaPhase === "stacked";

  const onPrintComplete = useCallback(() => setPrintComplete(true), []);

  useEffect(() => {
    if (view !== "summary") {
      setMegaPhase("wait");
      setPrintComplete(false);
      setShowCut(false);
      return;
    }

    setMegaPhase("wait");
    setPrintComplete(false);
    setShowCut(false);

    const startId = window.setTimeout(
      () => setMegaPhase("print"),
      SESSION_PRINT_START_DELAY_MS,
    );
    return () => window.clearTimeout(startId);
  }, [view, endedSession.startedAt, endedSession.endedAt]);

  useEffect(() => {
    if (view !== "summary" || megaPhase !== "print" || !printComplete) return;

    const cutId = window.setTimeout(() => {
      setShowCut(true);
      setMegaPhase("cut");
    }, RECEIPT_CUT_DELAY_MS);
    return () => window.clearTimeout(cutId);
  }, [view, megaPhase, printComplete]);

  useEffect(() => {
    if (megaPhase !== "cut") return;
    const stackId = window.setTimeout(
      () => setMegaPhase("landing"),
      SESSION_STACK_AFTER_CUT_MS,
    );
    return () => window.clearTimeout(stackId);
  }, [megaPhase]);

  const stackReceipts = useMemo(
    () => [...sessionTaskReceipts].slice(-12).reverse(),
    [sessionTaskReceipts],
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-[color:var(--color-ground)] flex flex-col">
      <div className="shrink-0 border-b border-[color:var(--color-shell-outline)] bg-[color:var(--color-shell)] px-6 py-4 flex items-center gap-3 z-50">
        <button
          type="button"
          onClick={onBack}
          className="btn-skeuo px-4 h-9 rounded-full text-[12px] tracking-wider text-[color:var(--color-ink)]"
        >
          {backLabel}
        </button>
        {onEndSession ? (
          <button
            type="button"
            onClick={onEndSession}
            className="btn-skeuo px-4 h-9 rounded-full text-[12px] tracking-wider text-[color:var(--color-ink)]"
          >
            End session
          </button>
        ) : null}
        <span className="text-[13px] tracking-[0.18em] uppercase text-[color:var(--color-ink)]/85 ml-2">
          {title}
        </span>
        <button
          type="button"
          onClick={() => setView(view === "summary" ? "gallery" : "summary")}
          className="btn-skeuo px-4 h-9 rounded-full text-[12px] tracking-wider text-[color:var(--color-ink)] ml-auto"
        >
          {view === "summary"
            ? `See all receipts (${sessionTaskReceipts.length}) →`
            : "← Back to summary"}
        </button>
      </div>

      {view === "gallery" ? (
        <SessionGallery receipts={sessionTaskReceipts} />
      ) : (
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div className="absolute inset-0 flex justify-center">
            <div className="relative w-[min(720px,100%)] h-full">
              <div className="absolute top-[72px] left-1/2 -translate-x-1/2 w-[420px] z-30">
                <div className="printer-slot h-[10px] rounded-b-[4px]" />
              </div>

              <div className="absolute top-[82px] left-1/2 -translate-x-1/2 z-25">
                {(megaPhase === "print" || megaPhase === "cut") && (
                  <MegaReceiptStrip
                    printReveal={megaPhase === "print"}
                    onPrintComplete={onPrintComplete}
                    squares={megaSquares}
                    stats={stats}
                    startedAt={endedSession.startedAt}
                    endedAt={endedSession.endedAt}
                    showTearTop={showCut}
                    showCutLine={showCut}
                  />
                )}
              </div>

              <div
                className={`absolute top-[240px] left-1/2 -translate-x-1/2 ${
                  megaPhase === "landing" ? "z-30" : "z-20"
                }`}
              >
                <div className="relative w-[380px] h-[560px]">
                  <AnimatePresence initial={false}>
                    {megaInStack && (
                      <motion.div
                        key={`mega-${endedSession.endedAt}`}
                        initial={
                          megaPhase === "landing"
                            ? {
                                y: -PRINTER_TO_STACK_OFFSET,
                                opacity: 1,
                                rotate: megaRotation - 1,
                              }
                            : false
                        }
                        animate={{
                          y: 0,
                          opacity: 1,
                          rotate: megaRotation,
                          scale: 1,
                        }}
                        transition={{
                          type: "spring",
                          stiffness: megaPhase === "landing" ? 110 : 140,
                          damping: megaPhase === "landing" ? 20 : 16,
                          mass: megaPhase === "landing" ? 0.75 : 0.6,
                        }}
                        onAnimationComplete={() => {
                          if (megaPhase === "landing") setMegaPhase("stacked");
                        }}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          zIndex: 100,
                          transformOrigin: "top center",
                          filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.18))",
                        }}
                      >
                        <MegaReceiptStrip
                          squares={megaSquares}
                          stats={stats}
                          startedAt={endedSession.startedAt}
                          endedAt={endedSession.endedAt}
                          showTearTop
                        />
                      </motion.div>
                    )}

                    {stackReceipts.map((r, idx) => {
                      const stackIdx = megaInStack ? idx + 1 : idx;
                      return (
                        <motion.div
                          key={r.id}
                          animate={{
                            y: stackIdx * 8,
                            opacity: 1,
                            rotate: r.rotation + stackIdx * 0.4,
                            scale: 1 - stackIdx * 0.012,
                          }}
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
                            zIndex: 100 - stackIdx,
                            transformOrigin: "top center",
                            filter:
                              stackIdx === 0
                                ? "drop-shadow(0 10px 18px rgba(0,0,0,0.18))"
                                : `drop-shadow(0 ${4 + stackIdx}px 6px rgba(0,0,0,0.12))`,
                          }}
                        >
                          <Receipt receipt={r} />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>

              <div className="tray-surface absolute inset-x-0 top-[82px] bottom-0 pointer-events-none">
                <div className="tray-surface__image absolute inset-0" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
