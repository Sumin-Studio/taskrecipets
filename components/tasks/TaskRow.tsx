"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Task, useStore } from "@/lib/store";

export function TaskRow({ task }: { task: Task }) {
  const currentTaskId = useStore((s) => s.currentTaskId);
  const selectTask = useStore((s) => s.selectTask);
  const completeTask = useStore((s) => s.completeTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const removeSubtask = useStore((s) => s.removeSubtask);
  const removeTask = useStore((s) => s.removeTask);

  const [expanded, setExpanded] = useState(false);
  const [subInput, setSubInput] = useState("");

  const isCurrent = currentTaskId === task.id;
  const isDone = !!task.completedAt;
  const allSubsDone = task.subtasks.length > 0 && task.subtasks.every((s) => s.done);

  return (
    <div
      className={`rounded-xl bg-white/70 outline outline-1 outline-[color:var(--color-shell-outline)]/70 transition-shadow ${
        isCurrent && !isDone ? "shadow-[0_0_0_2px_rgba(54,54,54,0.18)]" : ""
      }`}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        {/* checkbox */}
        <button
          onClick={() => completeTask(task.id)}
          aria-label="Complete task"
          className="mt-0.5 w-[18px] h-[18px] shrink-0 rounded-[5px] border border-[color:var(--color-shell-outline)] bg-white hover:border-[color:var(--color-ink)] transition-colors flex items-center justify-center"
        >
          {isDone && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <button
          onClick={() => !isDone && selectTask(task.id)}
          className={`flex-1 text-left text-[14px] leading-snug ${
            isDone ? "line-through text-[color:var(--color-muted)]" : "text-[color:var(--color-ink)]"
          } cursor-pointer`}
        >
          {task.title}
          {task.pomodorosCompleted > 0 && (
            <span className="ml-2 text-[11px] text-[color:var(--color-muted)] tabular-nums">
              {"■".repeat(Math.min(task.pomodorosCompleted, 8))}
              {task.pomodorosCompleted > 8 ? ` ×${task.pomodorosCompleted}` : ""}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {!isDone && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[11px] text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] px-1.5 h-6 rounded"
              aria-label="Toggle subtasks"
            >
              {expanded || task.subtasks.length > 0
                ? `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length || "+"}`
                : "+"}
            </button>
          )}
          <button
            onClick={() => removeTask(task.id)}
            className="text-[color:var(--color-muted)]/60 hover:text-[color:var(--color-ink)] w-6 h-6 flex items-center justify-center"
            aria-label="Remove task"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
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
            <div className="pl-9 pr-3 pb-3 space-y-1.5">
              {task.subtasks.map((su) => (
                <div key={su.id} className="flex items-center gap-2 text-[13px]">
                  <button
                    onClick={() => toggleSubtask(task.id, su.id)}
                    className="w-[14px] h-[14px] rounded-[3px] border border-[color:var(--color-shell-outline)] bg-white flex items-center justify-center shrink-0"
                  >
                    {su.done && (
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
              {allSubsDone && (
                <div className="text-[11px] text-[color:var(--color-muted)] italic pt-1">
                  All subtasks done — tick the checkbox to print the receipt.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
