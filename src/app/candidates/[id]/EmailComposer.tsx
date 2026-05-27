"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { renderTemplate } from "@/lib/template-renderer";
import { sendCandidateEmail, type ComposeResult } from "./email-actions";

type Application = { id: string; jobTitle: string };
type Template = { id: string; name: string; subject: string; body: string };

export function EmailComposer({
  candidateId,
  candidateEmail,
  candidateFirstName,
  candidateLastName,
  candidatePhone,
  senderName,
  senderEmail,
  applications,
  templates,
}: {
  candidateId: string;
  candidateEmail: string;
  candidateFirstName: string;
  candidateLastName: string;
  candidatePhone: string | null;
  senderName: string;
  senderEmail: string;
  applications: Application[];
  templates: Template[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [subjectValue, setSubjectValue] = useState<string>("");
  const [bodyValue, setBodyValue] = useState<string>("");

  const bound = sendCandidateEmail.bind(null, candidateId);
  const [state, action, pending] = useActionState<ComposeResult | undefined, FormData>(
    bound,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const defaultBody = `Hi ${candidateFirstName},\n\n\n\nBest,\n${senderName}`;

  useEffect(() => {
    if (open && !bodyValue) setBodyValue(defaultBody);
  }, [open, bodyValue, defaultBody]);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setSubjectValue("");
      setBodyValue("");
      const t = setTimeout(() => setOpen(false), 1200);
      return () => clearTimeout(t);
    }
  }, [state]);

  function applyTemplate(template: Template) {
    const jobTitle =
      applications.find((a) => a.id === selectedAppId)?.jobTitle ?? "";
    const ctx = {
      "candidate.firstName": candidateFirstName,
      "candidate.lastName": candidateLastName,
      "candidate.email": candidateEmail,
      "candidate.phone": candidatePhone ?? "",
      "sender.name": senderName,
      "sender.email": senderEmail,
      "job.title": jobTitle,
    };
    setSubjectValue(renderTemplate(template.subject, ctx));
    setBodyValue(renderTemplate(template.body, ctx));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 text-xs font-medium"
      >
        Compose email
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="w-full space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
    >
      <div>
        <div className="text-xs text-zinc-500 mb-1">
          To: <span className="font-mono text-zinc-700 dark:text-zinc-300">{candidateEmail}</span>
        </div>
      </div>

      {applications.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="applicationId">
            Link to a job (optional)
          </label>
          <select
            id="applicationId"
            name="applicationId"
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">— Not linked —</option>
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.jobTitle}
              </option>
            ))}
          </select>
        </div>
      )}

      {templates.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="templatePicker">
            Use a template (optional)
          </label>
          <select
            id="templatePicker"
            value=""
            onChange={(e) => {
              const tpl = templates.find((t) => t.id === e.target.value);
              if (tpl) applyTemplate(tpl);
              e.target.value = "";
            }}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">— Pick a template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Placeholders fill from this candidate{selectedAppId ? " and the linked job" : " (link a job above for {{job.title}})"}.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          required
          value={subjectValue}
          onChange={(e) => setSubjectValue(e.target.value)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={10}
          value={bodyValue}
          onChange={(e) => setBodyValue(e.target.value)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Replies will go to your email address ({senderEmail}).
        </p>
      </div>

      {state?.ok === true && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 px-3 py-2 text-sm">
          Sent via {state.provider}.
        </div>
      )}
      {state?.ok === false && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-3 py-2 text-sm">
          {state.error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
