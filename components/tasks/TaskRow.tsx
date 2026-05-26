"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Task, useStore, formatDuration } from "@/lib/store";

export function TaskRow({ task }: { task: Task }) {
  const currentTaskId = useStore((s) => s.currentTaskId);
  const selectTask = useStore((s) => s.selectTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const removeSubtask = useStore((s) => s.removeSubtask);
  const removeTask = useStore((s) => s.removeTask);

  const [expanded, setExpanded] = useState(false);
  const [subInput, setSubInput] = useState("");

  const isCurrent = currentTaskId === task.id;
  const isDone = !!task.completedAt;
  const subDoneCount = task.subtasks.filter((s) => s.done).length;
  const subTotal = task.subtasks.length;

  return (
    <div
      className={`task-row rounded-2xl transition-shadow ${
        isCurrent && !isDone ? "task-row-current" : ""
      }`}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        {/* select-as-current checkbox (filled when this is the live task) */}
        <button
          onClick={() => !isDone && selectTask(task.id)}
          aria-label="Select task"
          className="shrink-0 w-[18px] h-[18px] rounded-[5px] bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),0_1px_0_rgba(255,255,255,0.9)] border border-[color:var(--color-shell-outline)] flex items-center justify-center hover:border-[color:var(--color-ink)]/60 transition-colors"
        >
          {isCurrent && !isDone && (
            <span className="w-[8px] h-[8px] rounded-[2px] bg-[color:var(--color-ink)]" />
          )}
          {isDone && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* title + inline subtask toggle */}
        <button
          onClick={() => !isDone && selectTask(task.id)}
          className={`flex items-center gap-2 flex-1 text-left text-[14px] leading-snug ${
            isDone ? "line-through text-[color:var(--color-muted)]" : "text-[color:var(--color-ink)]"
          }`}
        >
          <span className="truncate">{task.title}</span>
          {!isDone && (
            <span
              role="button"
              aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="subtask-pill shrink-0 inline-flex items-center justify-center h-[20px] min-w-[20px] px-1.5 rounded-full text-[10px] tabular-nums text-[color:var(--color-ink)]/70 hover:text-[color:var(--color-ink)]"
            >
              {subTotal > 0 ? `${subDoneCount}/${subTotal}` : "+"}
            </span>
          )}
        </button>

        {isDone && (
          <span className="shrink-0 text-[10px] text-[color:var(--color-muted)] tabular-nums">
            {formatDuration(task.totalActiveMs)}
          </span>
        )}

        <button
          onClick={() => removeTask(task.id)}
          aria-label="Remove task"
          className="shrink-0 text-[color:var(--color-muted)]/60 hover:text-[color:var(--color-ink)] w-6 h-6 flex items-center justify-center"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && !isDone && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="pl-[42px] pr-3 pb-3 space-y-1.5">
              {task.subtasks.map((su) => (
                <div key={su.id} className="flex items-center gap-2 text-[13px]">
                  <button
                    onClick={() => toggleSubtask(task.id, su.id)}
                    className="w-[14px] h-[14px] rounded-[3px] border border-[color:var(--color-shell-outline)] bg-white flex items-center justify-center shrink-0"
                  >
                    {su.done && (
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`flex-1 ${su.done ? "line-through text-[color:var(--color-muted)]" : ""}`}
                  >
                    {su.title}
                  </span>
                  <button
                    onClick={() => removeSubtask(task.id, su.id)}
                    aria-label="Remove subtask"
                    className="text-[color:var(--color-muted)]/60 hover:text-[color:var(--color-ink)] w-5 h-5 flex items-center justify-center"
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (subInput.trim()) {
                    addSubtask(task.id, subInput);
                    setSubInput("");
                  }
                }}
                className="flex items-center gap-2 pt-1"
              >
                <span className="w-[14px] text-[color:var(--color-muted)] text-center">+</span>
                <input
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  placeholder="Add a subtask"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[color:var(--color-muted)]/70"
                />
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
