"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export function AddTaskInput() {
  const addTask = useStore((s) => s.addTask);
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          addTask(value);
          setValue("");
        }
      }}
      className="rounded-xl bg-white/70 outline outline-1 outline-[color:var(--color-shell-outline)]/70 flex items-center gap-2 px-3 h-[44px]"
    >
      <span className="text-[color:var(--color-muted)]">+</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
