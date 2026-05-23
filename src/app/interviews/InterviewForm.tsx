"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { InterviewType } from "@/generated/prisma";

type UserOpt = { id: string; name: string | null; email: string };
type CandidateOpt = { id: string; firstName: string; lastName: string; email: string };
type ApplicationOpt = { id: string; jobTitle: string };

const TYPE_LABEL: Record<InterviewType, string> = {
  PHONE_SCREEN: "Phone screen",
  TECHNICAL: "Technical",
  ONSITE: "Onsite",
  FINAL: "Final",
  CULTURE_FIT: "Culture fit",
  OTHER: "Other",
};

export type InterviewDefaults = {
  candidateId?: string;
  applicationId?: string | null;
  title?: string;
  type?: InterviewType;
  startAt?: string; // YYYY-MM-DDTHH:mm
  endAt?: string;
  timezone?: string | null;
  location?: string | null;
  videoUrl?: string | null;
  description?: string | null;
  attendees?: Array<{
    userId?: string | null;
    email: string;
    name?: string | null;
    role?: string | null;
  }>;
};

export function InterviewForm({
  action,
  submitLabel,
  cancelHref,
  candidates,
  applicationsByCandidate,
  teamUsers,
  defaults,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  cancelHref: string;
  candidates: CandidateOpt[];
  applicationsByCandidate: Record<string, ApplicationOpt[]>;
  teamUsers: UserOpt[];
  defaults?: InterviewDefaults;
}) {
  const [pending, startTransition] = useTransition();
  const [candidateId, setCandidateId] = useState<string>(
    defaults?.candidateId ?? candidates[0]?.id ?? "",
  );
  const [attendees, setAttendees] = useState<InterviewDefaults["attendees"]>(
    defaults?.attendees ?? [],
  );

  const candidate = candidates.find((c) => c.id === candidateId);
  const apps = applicationsByCandidate[candidateId] ?? [];

  function addAttendee(a: { userId?: string | null; email: string; name?: string | null; role?: string | null }) {
    setAttendees((prev) => [...(prev ?? []), a]);
  }
  function removeAttendee(idx: number) {
    setAttendees((prev) => (prev ?? []).filter((_, i) => i !== idx));
  }

  return (
    <form
      action={(fd) => startTransition(() => Promise.resolve(action(fd)))}
      className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
    >
      <input type="hidden" name="candidateId" value={candidateId} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Candidate</label>
          {defaults?.candidateId ? (
            <div className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm">
              {candidate ? `${candidate.firstName} ${candidate.lastName} (${candidate.email})` : "—"}
            </div>
          ) : (
            <CandidateCombobox
              candidates={candidates}
              selected={candidate ?? null}
              onChange={(c) => setCandidateId(c.id)}
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="applicationId">
            For job (optional)
          </label>
          <select
            id="applicationId"
            name="applicationId"
            defaultValue={defaults?.applicationId ?? ""}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">— Not linked —</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.jobTitle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={defaults?.title ?? (candidate ? `Phone screen — ${candidate.firstName} ${candidate.lastName}` : "")}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue={defaults?.type ?? InterviewType.PHONE_SCREEN}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            {(Object.keys(TYPE_LABEL) as InterviewType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="startAt">
            Start
          </label>
          <input
            id="startAt"
            name="startAt"
            type="datetime-local"
            required
            defaultValue={defaults?.startAt}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="endAt">
            End
          </label>
          <input
            id="endAt"
            name="endAt"
            type="datetime-local"
            required
            defaultValue={defaults?.endAt}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="timezone">
            Timezone (optional)
          </label>
          <input
            id="timezone"
            name="timezone"
            placeholder="America/Los_Angeles"
            defaultValue={defaults?.timezone ?? ""}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="location">
            Location
          </label>
          <input
            id="location"
            name="location"
            placeholder="Office room 4 / Address"
            defaultValue={defaults?.location ?? ""}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="videoUrl">
            Video URL
          </label>
          <input
            id="videoUrl"
            name="videoUrl"
            placeholder="https://meet.google.com/..."
            defaultValue={defaults?.videoUrl ?? ""}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="description">
          Description / agenda
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaults?.description ?? ""}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>

      <AttendeeEditor
        candidate={candidate ?? null}
        teamUsers={teamUsers}
        attendees={attendees ?? []}
        onAdd={addAttendee}
        onRemove={removeAttendee}
      />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="sendInvites" defaultChecked className="mt-1" />
        <span>
          <span className="font-medium">Email invites with .ics attachment</span>
          <span className="block text-xs text-zinc-500">
            Candidate + attendees get an email with the calendar invite.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <a
          href={cancelHref}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

function CandidateCombobox({
  candidates,
  selected,
  onChange,
}: {
  candidates: CandidateOpt[];
  selected: CandidateOpt | null;
  onChange: (c: CandidateOpt) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const full = `${c.firstName} ${c.lastName}`.toLowerCase();
      return (
        full.includes(q) ||
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [candidates, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Focus the search input when the panel opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIdx(0);
      // Wait for the input to mount.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keep highlight in range when filtered list shrinks.
  useEffect(() => {
    if (highlightIdx >= filtered.length) setHighlightIdx(Math.max(0, filtered.length - 1));
  }, [filtered, highlightIdx]);

  function pick(c: CandidateOpt) {
    onChange(c);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[highlightIdx];
      if (c) pick(c);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  const label = selected
    ? `${selected.firstName} ${selected.lastName} (${selected.email})`
    : "— Pick candidate —";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={`w-full text-left rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm flex items-center justify-between gap-2 ${
          selected ? "" : "text-zinc-500"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden="true" className="text-zinc-400 text-xs">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightIdx(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search by name or email…"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-72 overflow-y-auto py-1 text-sm"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-zinc-500 text-xs">No matches.</li>
            ) : (
              filtered.map((c, idx) => {
                const isSelected = selected?.id === c.id;
                const isHighlighted = idx === highlightIdx;
                return (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onMouseDown={(e) => {
                      // Prevent button blur before click fires.
                      e.preventDefault();
                      pick(c);
                    }}
                    className={`cursor-pointer px-3 py-1.5 ${
                      isHighlighted
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : ""
                    } ${isSelected ? "font-medium" : ""}`}
                  >
                    <div className="truncate">
                      {c.firstName} {c.lastName}
                    </div>
                    <div className="truncate text-xs text-zinc-500">{c.email}</div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function AttendeeEditor({
  candidate,
  teamUsers,
  attendees,
  onAdd,
  onRemove,
}: {
  candidate: CandidateOpt | null;
  teamUsers: UserOpt[];
  attendees: NonNullable<InterviewDefaults["attendees"]>;
  onAdd: (a: { userId?: string | null; email: string; name?: string | null; role?: string | null }) => void;
  onRemove: (idx: number) => void;
}) {
  const [picker, setPicker] = useState<string>("");
  const [extEmail, setExtEmail] = useState("");
  const [extName, setExtName] = useState("");

  function addCandidateAsAttendee() {
    if (!candidate) return;
    if (attendees.some((a) => a.email.toLowerCase() === candidate.email.toLowerCase())) return;
    onAdd({
      email: candidate.email,
      name: `${candidate.firstName} ${candidate.lastName}`,
      role: "Candidate",
      userId: null,
    });
  }

  function addInternal() {
    const user = teamUsers.find((u) => u.id === picker);
    if (!user) return;
    if (attendees.some((a) => a.email.toLowerCase() === user.email.toLowerCase())) return;
    onAdd({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: "Interviewer",
    });
    setPicker("");
  }

  function addExternal() {
    const e = extEmail.trim();
    if (!e) return;
    onAdd({
      email: e,
      name: extName.trim() || null,
      role: "Interviewer",
      userId: null,
    });
    setExtEmail("");
    setExtName("");
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Attendees</label>
      <ul className="space-y-1 mb-3">
        {attendees.length === 0 && (
          <li className="text-xs text-zinc-500">
            No attendees yet. Add the candidate, your panel, and any externals.
          </li>
        )}
        {attendees.map((a, idx) => (
          <li
            key={`${a.email}-${idx}`}
            className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-sm"
          >
            <span>
              {a.name ? `${a.name} ` : ""}
              <span className="text-zinc-500">&lt;{a.email}&gt;</span>
              {a.role && <span className="ml-2 text-xs text-zinc-500">· {a.role}</span>}
            </span>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="text-xs text-zinc-400 hover:text-red-600"
            >
              ×
            </button>
            <input type="hidden" name="attendeeUserId" value={a.userId ?? ""} />
            <input type="hidden" name="attendeeEmail" value={a.email} />
            <input type="hidden" name="attendeeName" value={a.name ?? ""} />
            <input type="hidden" name="attendeeRole" value={a.role ?? ""} />
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 text-sm">
        {candidate && (
          <button
            type="button"
            onClick={addCandidateAsAttendee}
            disabled={attendees.some((a) => a.email.toLowerCase() === candidate.email.toLowerCase())}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            + Add candidate
          </button>
        )}
        <div className="flex gap-1">
          <select
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-2 text-sm"
          >
            <option value="">— Add team member —</option>
            {teamUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addInternal}
            disabled={!picker}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            +
          </button>
        </div>
        <div className="flex gap-1">
          <input
            type="email"
            value={extEmail}
            onChange={(e) => setExtEmail(e.target.value)}
            placeholder="external@..."
            className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-2 text-sm"
          />
          <input
            type="text"
            value={extName}
            onChange={(e) => setExtName(e.target.value)}
            placeholder="Name"
            className="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addExternal}
            disabled={!extEmail.trim()}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
