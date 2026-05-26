"use client";

import { AnyReceipt, SessionReceipt, formatDuration } from "@/lib/store";
import { ReceiptPrintStrip } from "./ReceiptPrintStrip";
import { ReceiptLogo } from "./ReceiptHeader";

export function Receipt({ receipt }: { receipt: AnyReceipt }) {
  if (receipt.kind !== "session") {
    return (
      <ReceiptPrintStrip
        taskStartedAt={receipt.taskStartedAt}
        timeline={receipt.timeline}
        upToTs={receipt.taskCompletedAt}
        squares={receipt.squares}
        feedFromPrinter
        showTearTop
        photoDataUrl={receipt.photoDataUrl}
        taskTitle={receipt.taskTitle}
        printedAt={receipt.printedAt}
      />
    );
  }

  return (
    <div className="relative w-full text-[color:var(--color-receipt-ink)] font-mono">
      <div className="receipt-tear-top h-[6px] bg-[color:var(--color-receipt)] -mb-px" />
      <div className="relative bg-[color:var(--color-receipt)] pt-4 px-5 pb-6">
        <SessionBody receipt={receipt} />
      </div>
      <div className="receipt-tear-bottom h-[6px] bg-[color:var(--color-receipt)] -mt-px" />
    </div>
  );
}

function SessionBody({ receipt }: { receipt: SessionReceipt }) {
  const ts = new Date(receipt.printedAt);
  const dateStr = ts.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = ts.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-center pt-1">
        <ReceiptLogo className="h-[26px]" />
      </div>
      <div className="text-center text-[14px] font-semibold tracking-wider">
        SESSION SUMMARY
      </div>
      <div className="text-center text-[10px] tracking-wider">
        {dateStr} · {timeStr} · #{String(receipt.number).padStart(4, "0")}
      </div>

      <div className="border-t border-dashed border-[color:var(--color-receipt-ink)]/30 pt-2 text-[10px] tracking-wider space-y-0.5">
        <RowKV label="Tasks done" value={String(receipt.tasksCompleted.length)} />
        <RowKV label="Total active" value={formatDuration(receipt.sessionActiveMs)} />
        <RowKV label="Total break" value={formatDuration(receipt.sessionBreakMs)} />
      </div>

      {receipt.tasksCompleted.length > 0 && (
        <div className="border-t border-dashed border-[color:var(--color-receipt-ink)]/30 pt-2">
          <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">
            Tasks
          </div>
          <ul className="space-y-1 text-[11px]">
            {receipt.tasksCompleted.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-1 truncate">{t.title}</span>
                <span className="tabular-nums opacity-80">
                  {formatDuration(t.activeMs)}
                  {t.breaks > 0 ? ` · ${t.breaks}b` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-center text-[10px] italic pt-1">“{receipt.motto}”</div>
      <div className="text-center text-[9px] tracking-[0.2em] mt-1 text-[color:var(--color-receipt-ink)]/60">
        THANK YOU FOR FOCUSING
      </div>
    </div>
  );
}

function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="opacity-70">{label}</span>
      <span className="flex-1 border-b border-dotted border-[color:var(--color-receipt-ink)]/30 mx-1 translate-y-[-3px]" />
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
