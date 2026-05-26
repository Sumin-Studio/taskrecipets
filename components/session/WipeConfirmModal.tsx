"use client";

export function WipeConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[92vw] rounded-2xl bg-[color:var(--color-shell)] border border-[color:var(--color-shell-outline)] shadow-[0_20px_40px_rgba(0,0,0,0.25)] p-6"
      >
        <h2 className="text-[15px] font-semibold tracking-wider text-[color:var(--color-ink)]">
          End session?
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--color-muted)]">
          All tasks and receipts will be cleared. This can&apos;t be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-skeuo px-4 h-9 rounded-full text-[12px] tracking-wider text-[color:var(--color-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-skeuo px-4 h-9 rounded-full text-[12px] tracking-wider text-[color:var(--color-ink)]"
          >
            End session
          </button>
        </div>
      </div>
    </div>
  );
}
