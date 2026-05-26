"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { TaskRow } from "./TaskRow";
import { AddTaskInput } from "./AddTaskInput";

type Filter = "ongoing" | "done";

export function TaskList() {
  const tasks = useStore((s) => s.tasks);
  const [filter, setFilter] = useState<Filter>("ongoing");
  const [adding, setAdding] = useState(false);

  const visible = tasks.filter((t) =>
    filter === "ongoing" ? !t.completedAt : !!t.completedAt,
  );

  return (
    <div className="workspace-panel flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] tracking-[0.18em] uppercase text-[color:var(--color-ink)]/85">
            Task list
          </h2>
          {filter === "ongoing" && (
            <button
              onClick={() => setAdding((v) => !v)}
              aria-label={adding ? "Cancel add task" : "Add task"}
              aria-pressed={adding}
              className="shrink-0 w-[28px] h-[28px] min-w-[28px] min-h-[28px] rounded-full flex items-center justify-center text-[color:var(--color-ink)]/70 hover:text-[color:var(--color-ink)] hover:bg-black/5 transition-colors"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className={`transition-transform ${adding ? "rotate-45" : ""}`}
              >
                <path d="M7 1.5V12.5M1.5 7H12.5" />
              </svg>
            </button>
          )}
        </div>
        <FilterToggle value={filter} onChange={setFilter} />
      </div>
      <div className="h-px bg-[color:var(--color-shell-outline)]/70 mb-4" />

      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-2 py-2">
        {adding && filter === "ongoing" && (
          <AddTaskInput
            autoFocus
            onSubmitted={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}

        {visible.length === 0 && !adding ? (
          <div className="text-[13px] text-[color:var(--color-muted)] py-3 px-1">
            {filter === "ongoing"
              ? "No tasks yet. Hit + to add one."
              : "Nothing baked yet."}
          </div>
        ) : (
          visible.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

function FilterToggle({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  return (
    <div className="shell-skeuo rounded-full p-[3px] flex items-center text-[10px] uppercase tracking-wider">
      {(["ongoing", "done"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 h-[24px] rounded-full transition-colors ${
            value === v
              ? "bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] text-[color:var(--color-ink)]"
              : "text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
