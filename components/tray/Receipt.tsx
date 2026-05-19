"use client";

import { Receipt as ReceiptType, formatDuration } from "@/lib/store";

export function Receipt({ receipt }: { receipt: ReceiptType }) {
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
    <div className="relative bg-[color:var(--color-receipt)] w-full text-[color:var(--color-receipt-ink)] font-mono pt-5 px-6 pb-8 shadow-sm">
      <div className="receipt-noise absolute inset-0 pointer-events-none opacity-60" />

      <div className="relative">
        <div className="text-center text-[18px] tracking-[0.32em] font-medium">
          WORK RECIPE
        </div>
        <div className="text-center text-[10px] tracking-wider text-[color:var(--color-receipt-ink)]/70 mt-1">
          {dateStr} · {timeStr} · #{String(receipt.number).padStart(4, "0")}
        </div>

        <DottedRule />

        {receipt.kind === "task" ? (
          <TaskBody receipt={receipt} />
        ) : (
          <SessionBody receipt={receipt} />
        )}

        <DottedRule />

        <div className="text-center text-[11px] italic text-[color:var(--color-receipt-ink)]/80 pt-1">
          “{receipt.motto}”
        </div>
        <div className="text-center text-[9px] tracking-[0.2em] text-[color:var(--color-receipt-ink)]/60 mt-2">
          THANK YOU FOR FOCUSING
        </div>
      </div>

      {/* tear edge */}
      <div className="receipt-tear-bottom absolute bottom-0 left-0 right-0 h-3 bg-[color:var(--color-receipt)]" />
    </div>
  );
}

function TaskBody({ receipt }: { receipt: ReceiptType }) {
  return (
    <div className="text-[12px] leading-[18px] py-3">
      <div className="text-[14px] font-medium mb-2">{receipt.taskTitle}</div>

      <Row label="Pomodoros" value={`${"■".repeat(Math.min(receipt.pomodorosCompleted ?? 0, 12))}${(receipt.pomodorosCompleted ?? 0) > 12 ? ` ×${receipt.pomodorosCompleted}` : ""} (${receipt.pomodorosCompleted ?? 0})`} />
      <Row label="Focus time" value={formatDuration(receipt.totalFocusMs ?? 0)} />
      <Row label="Break time" value={formatDuration(receipt.totalBreakMs ?? 0)} />

      {receipt.subtasks && receipt.subtasks.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-receipt-ink)]/60 mb-1">
            Subtasks
          </div>
          <ul className="space-y-0.5">
            {receipt.subtasks.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[11px] mt-[1px]">{s.done ? "[x]" : "[ ]"}</span>
                <span className={`text-[12px] flex-1 ${s.done ? "" : "text-[color:var(--color-receipt-ink)]/70"}`}>
                  {s.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SessionBody({ receipt }: { receipt: ReceiptType }) {
  return (
    <div className="text-[12px] leading-[18px] py-3">
      <div className="text-[14px] font-medium mb-2 tracking-wider">SESSION SUMMARY</div>
      <Row label="Tasks done" value={String(receipt.tasksCompleted?.length ?? 0)} />
      <Row label="Total focus" value={formatDuration(receipt.sessionFocusMs ?? 0)} />
      <Row label="Total break" value={formatDuration(receipt.sessionBreakMs ?? 0)} />

      {receipt.tasksCompleted && receipt.tasksCompleted.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-receipt-ink)]/60 mb-1">
            Tasks
          </div>
          <ul className="space-y-1">
            {receipt.tasksCompleted.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-[color:var(--color-receipt-ink)]/70 tabular-nums">
                  {t.pomodoros}p · {formatDuration(t.focusMs)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[color:var(--color-receipt-ink)]/70">{label}</span>
      <span className="flex-1 border-b border-dotted border-[color:var(--color-receipt-ink)]/30 mx-1 translate-y-[-3px]" />
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function DottedRule() {
  return (
    <div className="my-2.5 border-t border-dashed border-[color:var(--color-receipt-ink)]/35" />
  );
}
