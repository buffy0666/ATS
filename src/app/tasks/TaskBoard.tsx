"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TaskKind, TaskPriority, TaskStatus } from "@/generated/prisma";
import { completeTask } from "./actions";

export type BoardTask = {
  id: string;
  name: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueDate: Date | null;
  assignee: string | null;
  candidate: { id: string; name: string } | null;
  sequence: { id: string; name: string } | null;
  isSequenceTask: boolean;
  attachmentCount: number;
};

export type BoardGroups = {
  overdue: BoardTask[];
  today: BoardTask[];
  upcoming: BoardTask[];
  noDate: BoardTask[];
  completed: BoardTask[];
};

const KIND_LABEL: Record<TaskKind, string> = {
  GENERAL: "Task",
  CALL: "Call",
  EMAIL: "Email",
  TEXT: "Text",
  LINKEDIN: "LinkedIn",
};

const KIND_BADGE: Record<TaskKind, string> = {
  GENERAL: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  CALL: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  EMAIL: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  TEXT: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  LINKEDIN: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  MEDIUM: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  HIGH: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

// Kinds where capturing an outcome on completion is useful.
const OUTCOME_KINDS = new Set<TaskKind>([TaskKind.CALL, TaskKind.EMAIL, TaskKind.TEXT, TaskKind.LINKEDIN]);

function dueLabel(due: Date | null): { text: string; tone: string } {
  if (!due) return { text: "No due date", tone: "text-zinc-400" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { text: "Today", tone: "text-amber-600 dark:text-amber-400 font-medium" };
  if (days === 1) return { text: "Tomorrow", tone: "text-zinc-500" };
  if (days === -1) return { text: "1 day overdue", tone: "text-red-600 dark:text-red-400 font-medium" };
  if (days < -1) return { text: `${-days} days overdue`, tone: "text-red-600 dark:text-red-400 font-medium" };
  return { text: `In ${days} days`, tone: "text-zinc-500" };
}

export function TaskBoard({
  groups,
  scope,
  isAdmin,
  kind,
}: {
  groups: BoardGroups;
  scope: "me" | "all";
  isAdmin: boolean;
  kind: TaskKind | null;
}) {
  const actionableCount = groups.overdue.length + groups.today.length;

  return (
    <div>
      <Controls scope={scope} isAdmin={isAdmin} kind={kind} actionableCount={actionableCount} />

      <div className="mt-5 space-y-6">
        <Group title="Overdue" tone="red" tasks={groups.overdue} />
        <Group title="Due today" tone="amber" tasks={groups.today} />
        <Group title="Upcoming" tone="zinc" tasks={groups.upcoming} />
        <Group title="No due date" tone="zinc" tasks={groups.noDate} />
        <Group title="Completed" tone="emerald" tasks={groups.completed} muted />
      </div>

      {actionableCount === 0 &&
        groups.upcoming.length === 0 &&
        groups.noDate.length === 0 &&
        groups.completed.length === 0 && (
          <p className="text-sm text-zinc-500 mt-8 text-center">
            Nothing here{kind ? ` for ${KIND_LABEL[kind]}` : ""}. Enjoy the quiet. 🌤️
          </p>
        )}
    </div>
  );
}

function Controls({
  scope,
  isAdmin,
  kind,
  actionableCount,
}: {
  scope: "me" | "all";
  isAdmin: boolean;
  kind: TaskKind | null;
  actionableCount: number;
}) {
  function href(next: { scope?: "me" | "all"; kind?: TaskKind | null }) {
    const q = new URLSearchParams();
    const s = next.scope ?? scope;
    const k = next.kind === undefined ? kind : next.kind;
    if (s === "all") q.set("scope", "all");
    if (k) q.set("kind", k);
    const qs = q.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  }

  const kinds: (TaskKind | null)[] = [null, TaskKind.CALL, TaskKind.EMAIL, TaskKind.TEXT, TaskKind.LINKEDIN, TaskKind.GENERAL];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {isAdmin && (
        <div className="flex items-center gap-1.5">
          <Chip href={href({ scope: "me" })} active={scope === "me"} label="My tasks" />
          <Chip href={href({ scope: "all" })} active={scope === "all"} label="Everyone" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {kinds.map((k) => (
          <Chip
            key={k ?? "all"}
            href={href({ kind: k })}
            active={kind === k}
            label={k ? KIND_LABEL[k] : "All types"}
          />
        ))}
      </div>
      {actionableCount > 0 && (
        <span className="text-xs text-zinc-500 ml-auto">
          {actionableCount} need{actionableCount === 1 ? "s" : ""} attention
        </span>
      )}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </Link>
  );
}

const TONE_DOT: Record<string, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  zinc: "bg-zinc-300 dark:bg-zinc-600",
};

function Group({
  title,
  tone,
  tasks,
  muted,
}: {
  title: string;
  tone: string;
  tasks: BoardTask[];
  muted?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-zinc-500">{tasks.length}</span>
      </div>
      <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 ${muted ? "opacity-70" : ""}`}>
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
      </div>
    </section>
  );
}

function TaskCard({ task }: { task: BoardTask }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const done = task.status === TaskStatus.COMPLETE;
  const due = dueLabel(task.dueDate);

  function complete(outcome?: string) {
    startTransition(async () => {
      const r = await completeTask(task.id, outcome ?? null);
      if (r.ok) {
        setExpanded(false);
        setNote("");
        router.refresh();
      } else {
        alert(r.error ?? "Could not complete the task.");
      }
    });
  }

  function onDoneClick() {
    if (OUTCOME_KINDS.has(task.kind)) setExpanded((s) => !s);
    else complete();
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        {!done ? (
          <button
            type="button"
            onClick={onDoneClick}
            disabled={pending}
            title="Mark done"
            aria-label="Mark done"
            className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-zinc-400 dark:border-zinc-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
          />
        ) : (
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
            ✓
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${KIND_BADGE[task.kind]}`}>
              {KIND_LABEL[task.kind]}
            </span>
            <Link href={`/tasks/${task.id}`} className={`text-sm font-medium hover:underline ${done ? "line-through text-zinc-400" : ""}`}>
              {task.name}
            </Link>
            {task.priority && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${PRIORITY_BADGE[task.priority]}`}>
                {task.priority}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-zinc-500">
            {!done && <span className={due.tone}>{due.text}</span>}
            {task.candidate && (
              <Link href={`/candidates/${task.candidate.id}`} className="hover:underline">
                👤 {task.candidate.name}
              </Link>
            )}
            {task.sequence && (
              <Link href={`/sequences/${task.sequence.id}/enrollments`} className="hover:underline">
                ↳ {task.sequence.name}
              </Link>
            )}
            {task.assignee && <span>· {task.assignee}</span>}
            {task.attachmentCount > 0 && <span>· 📎 {task.attachmentCount}</span>}
          </div>

          {expanded && !done && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Outcome / notes (optional) — e.g. left voicemail, sent intro email…"
                rows={2}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => complete(note)}
                  disabled={pending}
                  className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Complete"}
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
