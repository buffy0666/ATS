"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStep,
  moveStep,
  removeStep,
  updateStep,
  type ActionResult,
} from "../actions";
import { SequenceStepType } from "@/generated/prisma";

export type StepRow = {
  id: string;
  order: number;
  type: SequenceStepType;
  delayDays: number;
  emailTemplateId: string | null;
  subject: string | null;
  body: string | null;
  taskTitle: string | null;
  taskInstructions: string | null;
};

export type TemplateOption = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

const STEP_TYPE_LABEL: Record<SequenceStepType, string> = {
  EMAIL: "Email (auto-sent)",
  CALL: "Call (manual task)",
  TEXT: "Text (manual task)",
  LINKEDIN: "LinkedIn (manual task)",
  TASK: "Other task (manual)",
};

export function StepBuilder({
  sequenceId,
  steps,
  templates,
}: {
  sequenceId: string;
  steps: StepRow[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  function showResult(r: ActionResult) {
    setBanner({ tone: r.ok ? "ok" : "err", text: r.message ?? (r.ok ? "Done." : "Failed.") });
  }

  function handleMove(stepId: string, direction: "up" | "down") {
    startTransition(async () => {
      const r = await moveStep(stepId, direction);
      showResult(r);
      router.refresh();
    });
  }

  function handleRemove(stepId: string) {
    if (!confirm("Remove this step? Pending step runs for enrolled candidates stay as-is.")) {
      return;
    }
    startTransition(async () => {
      const r = await removeStep(stepId);
      showResult(r);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {banner && (
        <p
          className={`text-sm ${
            banner.tone === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
          aria-live="polite"
        >
          {banner.text}
        </p>
      )}

      {steps.length === 0 ? (
        <p className="text-sm text-zinc-500">No steps yet — add the first one below.</p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            >
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="text-xs font-medium text-zinc-500 tabular-nums w-6 text-right">
                  {index + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {STEP_TYPE_LABEL[step.type]}
                    <span className="ml-2 text-xs text-zinc-500">
                      {step.delayDays === 0
                        ? "immediately"
                        : `+${step.delayDays} day${step.delayDays === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1">
                    {summaryFor(step)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton
                    title="Move up"
                    disabled={pending || index === 0}
                    onClick={() => handleMove(step.id, "up")}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    title="Move down"
                    disabled={pending || index === steps.length - 1}
                    onClick={() => handleMove(step.id, "down")}
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    title="Edit"
                    onClick={() => setEditingId(editingId === step.id ? null : step.id)}
                  >
                    ✎
                  </IconButton>
                  <IconButton
                    title="Delete"
                    tone="danger"
                    disabled={pending}
                    onClick={() => handleRemove(step.id)}
                  >
                    ✕
                  </IconButton>
                </div>
              </div>
              {editingId === step.id && (
                <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-3">
                  <StepForm
                    initial={step}
                    templates={templates}
                    submitLabel="Save step"
                    onSubmit={async (data) => {
                      const fd = toFormData(data);
                      const r = await updateStep(step.id, fd);
                      showResult(r);
                      if (r.ok) {
                        setEditingId(null);
                        router.refresh();
                      }
                      return r;
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {adding ? (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold mb-3">Add step</h3>
          <StepForm
            initial={null}
            templates={templates}
            submitLabel="Add step"
            onSubmit={async (data) => {
              const fd = toFormData(data);
              const r = await addStep(sequenceId, fd);
              showResult(r);
              if (r.ok) {
                setAdding(false);
                router.refresh();
              }
              return r;
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={pending}
          className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 w-full text-left disabled:opacity-50"
        >
          + Add step
        </button>
      )}
    </div>
  );
}

function summaryFor(step: StepRow): string {
  if (step.type === SequenceStepType.EMAIL) {
    return step.subject ?? "(no subject yet)";
  }
  return step.taskTitle ?? "(no task title yet)";
}

type StepFormData = {
  type: SequenceStepType;
  delayDays: number;
  emailTemplateId: string;
  subject: string;
  body: string;
  taskTitle: string;
  taskInstructions: string;
};

function StepForm({
  initial,
  templates,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: StepRow | null;
  templates: TemplateOption[];
  submitLabel: string;
  onSubmit: (data: StepFormData) => Promise<ActionResult>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<SequenceStepType>(initial?.type ?? SequenceStepType.EMAIL);
  const [delayDays, setDelayDays] = useState<number>(initial?.delayDays ?? 0);
  const [emailTemplateId, setEmailTemplateId] = useState<string>(initial?.emailTemplateId ?? "");
  const [subject, setSubject] = useState<string>(initial?.subject ?? "");
  const [body, setBody] = useState<string>(initial?.body ?? "");
  const [taskTitle, setTaskTitle] = useState<string>(initial?.taskTitle ?? "");
  const [taskInstructions, setTaskInstructions] = useState<string>(
    initial?.taskInstructions ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyTemplate(templateId: string) {
    setEmailTemplateId(templateId);
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    // Only overwrite when the field is empty — saves recruiters who already
    // started writing inline from accidental clobbering.
    if (!subject) setSubject(t.subject);
    if (!body) setBody(t.body);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await onSubmit({
        type,
        delayDays,
        emailTemplateId,
        subject,
        body,
        taskTitle,
        taskInstructions,
      });
      if (!r.ok) setError(r.message);
    });
  }

  const isEmail = type === SequenceStepType.EMAIL;

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
            Type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SequenceStepType)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
          >
            {Object.values(SequenceStepType).map((t) => (
              <option key={t} value={t}>
                {STEP_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
            Delay days (from previous step)
          </span>
          <input
            type="number"
            min={0}
            max={365}
            value={delayDays}
            onChange={(e) => setDelayDays(Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
          />
        </label>
        {isEmail && (
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
              Template (optional)
            </span>
            <select
              value={emailTemplateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
            >
              <option value="">— Custom —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isEmail ? (
        <>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
              Subject
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={998}
              placeholder="Subject line. Supports {{candidate.firstName}}, {{job.title}}, etc."
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
              Body
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={20000}
              placeholder="Hi {{candidate.firstName}},&#10;&#10;…&#10;&#10;Best,&#10;{{sender.name}}"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Placeholders: <code>{"{{candidate.firstName}}"}</code>, <code>{"{{candidate.lastName}}"}</code>,{" "}
            <code>{"{{candidate.email}}"}</code>, <code>{"{{sender.name}}"}</code>,{" "}
            <code>{"{{job.title}}"}</code>
          </p>
        </>
      ) : (
        <>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
              Task title
            </span>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Call to confirm interview slot"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
              Instructions
            </span>
            <textarea
              value={taskInstructions}
              onChange={(e) => setTaskInstructions(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Talking points, script, link, etc."
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
            />
          </label>
        </>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function toFormData(data: StepFormData): FormData {
  const fd = new FormData();
  fd.set("type", data.type);
  fd.set("delayDays", String(data.delayDays));
  fd.set("emailTemplateId", data.emailTemplateId);
  fd.set("subject", data.subject);
  fd.set("body", data.body);
  fd.set("taskTitle", data.taskTitle);
  fd.set("taskInstructions", data.taskInstructions);
  return fd;
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  tone?: "neutral" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2 py-1 text-sm font-medium disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
