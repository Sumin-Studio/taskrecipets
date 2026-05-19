"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { TaskRow } from "./TaskRow";
import { AddTaskInput } from "./AddTaskInput";

type Filter = "ongoing" | "done";

export function TaskList() {
  const tasks = useStore((s) => s.tasks);
  const [filter, setFilter] = useState<Filter>("ongoing");

  const visible = tasks.filter((t) =>
    filter === "ongoing" ? !t.completedAt : !!t.completedAt,
  );

  return (
    <div className="w-[500px]">
      {/* header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[18px] tracking-[0.18em] uppercase text-[color:var(--color-ink)]/85">
          Task list
        </h2>
        <FilterToggle value={filter} onChange={setFilter} />
      </div>
      <div className="h-px bg-[color:var(--color-shell-outline)]/70 mb-4" />

      <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 -mr-1">
        {visible.length === 0 ? (
          <div className="text-[13px] text-[color:var(--color-muted)] py-4 px-1">
            {filter === "ongoing"
              ? "No tasks yet. Add one below to start cooking."
              : "Nothing baked yet."}
          </div>
        ) : (
          visible.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>

      {filter === "ongoing" && (
        <div className="mt-4">
          <AddTaskInput />
        </div>
      )}
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
    <div className="shell-skeuo rounded-full p-[3px] flex items-center text-[11px] uppercase tracking-wider">
      {(["ongoing", "done"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 h-[26px] rounded-full transition-colors ${
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
