"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TaskKind, TaskPriority, TaskStatus } from "@/generated/prisma";
import { completeTask, createCandidateTask } from "../../tasks/actions";

export type CandidateTaskRow = {
  id: string;
  name: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueDate: Date | null;
  assignee: string | null;
};

const KIND_LABEL: Record<TaskKind, string> = {
  GENERAL: "Task",
  CALL: "Call",
  EMAIL: "Email",
  TEXT: "Text",
  LINKEDIN: "LinkedIn",
};

function dueLabel(due: Date | null): { text: string; tone: string } {
  if (!due) return { text: "", tone: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { text: "Today", tone: "text-amber-600 dark:text-amber-400" };
  if (days < 0) return { text: `${-days}d overdue`, tone: "text-red-600 dark:text-red-400" };
  if (days === 1) return { text: "Tomorrow", tone: "text-zinc-500" };
  return { text: `in ${days}d`, tone: "text-zinc-500" };
}

export function CandidateTasksSection({
  candidateId,
  tasks,
}: {
  candidateId: string;
  tasks: CandidateTaskRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = tasks.filter((t) => t.status !== TaskStatus.COMPLETE);
  const done = tasks.filter((t) => t.status === TaskStatus.COMPLETE);

  function add() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await createCandidateTask(candidateId, { name, dueDate: dueDate || null });
      if (r.ok) {
        setName("");
        setDueDate("");
        router.refresh();
      } else {
        setError(r.error ?? "Could not add task.");
      }
    });
  }

  function complete(id: string) {
    startTransition(async () => {
      const r = await completeTask(id, null);
      if (r.ok) router.refresh();
      else setError(r.error ?? "Could not complete task.");
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Tasks</h3>
        <Link href={`/tasks`} className="text-xs text-zinc-500 hover:underline">
          All tasks →
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add a task (e.g. Follow up next week)…"
          className="flex-1 min-w-[12rem] rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || !name.trim()}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {open.length === 0 && done.length === 0 ? (
        <p className="text-sm text-zinc-500">No tasks for this candidate yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
          {open.map((t) => {
            const due = dueLabel(t.dueDate);
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => complete(t.id)}
                  disabled={pending}
                  title="Mark done"
                  aria-label="Mark done"
                  className="h-4 w-4 shrink-0 rounded-full border border-zinc-400 dark:border-zinc-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
                />
                <Link href={`/tasks/${t.id}`} className="text-sm hover:underline flex-1 min-w-0 truncate">
                  {t.kind !== TaskKind.GENERAL && (
                    <span className="text-[10px] uppercase tracking-wide text-zinc-400 mr-1.5">
                      {KIND_LABEL[t.kind]}
                    </span>
                  )}
                  {t.name}
                </Link>
                {due.text && <span className={`text-xs whitespace-nowrap ${due.tone}`}>{due.text}</span>}
              </li>
            );
          })}
          {done.length > 0 && (
            <li className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-400 bg-zinc-50 dark:bg-zinc-950">
              Completed
            </li>
          )}
          {done.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2 opacity-60">
              <span className="h-4 w-4 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                ✓
              </span>
              <Link href={`/tasks/${t.id}`} className="text-sm line-through flex-1 min-w-0 truncate hover:underline">
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
