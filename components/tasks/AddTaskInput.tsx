"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export function AddTaskInput({
  autoFocus,
  onSubmitted,
  onCancel,
}: {
  autoFocus?: boolean;
  onSubmitted?: () => void;
  onCancel?: () => void;
}) {
  const addTask = useStore((s) => s.addTask);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          addTask(value);
          setValue("");
          onSubmitted?.();
        }
      }}
      className="task-row rounded-2xl flex items-center gap-2.5 px-3.5 h-[44px]"
    >
      <span className="w-[18px] text-center text-[color:var(--color-muted)] text-[16px] leading-none">
        +
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue("");
            onCancel?.();
          }
        }}
        placeholder="Add a task to your recipe"
        className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[color:var(--color-muted)]/70"
      />
      {value && (
        <button
          type="submit"
          className="text-[11px] uppercase tracking-wider text-[color:var(--color-ink)]/75 hover:text-[color:var(--color-ink)]"
        >
          Add
        </button>
      )}
    </form>
  );
}
