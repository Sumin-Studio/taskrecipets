"use client";

import { useStore } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/20 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute top-full left-0 mt-3 w-[420px] z-50 shell-skeuo rounded-[24px] p-5"
          >
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
              Settings
            </div>
            <div className="space-y-3">
              <NumberRow
                label="Focus"
                valueMin={settings.focusMs / 60_000}
                onChange={(v) => updateSettings({ focusMs: v * 60_000 })}
              />
              <NumberRow
                label="Short break"
                valueMin={settings.shortBreakMs / 60_000}
                onChange={(v) => updateSettings({ shortBreakMs: v * 60_000 })}
              />
              <NumberRow
                label="Long break"
                valueMin={settings.longBreakMs / 60_000}
                onChange={(v) => updateSettings({ longBreakMs: v * 60_000 })}
              />
              <NumberRow
                label="Long break every"
                valueMin={settings.longBreakEvery}
                unit="focus blocks"
                onChange={(v) => updateSettings({ longBreakEvery: Math.max(1, v) })}
              />
              <label className="flex items-center justify-between pt-1 text-[13px]">
                <span className="text-[color:var(--color-ink)]/75">Sound</span>
                <button
                  onClick={() => updateSettings({ soundOn: !settings.soundOn })}
                  className="btn-skeuo h-[28px] px-3 rounded-full text-[11px] uppercase tracking-wider"
                  data-pressed={settings.soundOn}
                >
                  {settings.soundOn ? "On" : "Off"}
                </button>
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="btn-skeuo h-[32px] px-4 rounded-full text-[11px] uppercase tracking-wider"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function NumberRow({
  label,
  valueMin,
  unit = "min",
  onChange,
}: {
  label: string;
  valueMin: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between text-[13px]">
      <span className="text-[color:var(--color-ink)]/75">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={valueMin}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onChange(v);
          }}
          className="w-[58px] h-[28px] rounded-md bg-white/60 outline outline-1 outline-[color:var(--color-shell-outline)] px-2 text-right tabular-nums text-[13px]"
        />
        <span className="text-[11px] text-[color:var(--color-muted)] w-[80px]">
          {unit}
        </span>
      </span>
    </label>
  );
}
