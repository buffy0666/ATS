"use client";

import { useState, useTransition } from "react";
import {
  deleteCertification,
  deleteEducation,
  saveCertification,
  saveEducation,
  toggleCertificationVerified,
} from "./education-actions";

export type EducationRow = {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  specialization: string | null;
  startYear: number | null;
  endYear: number | null;
  inProgress: boolean;
  gpa: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  honors: string | null;
  notes: string | null;
};

export type CertificationRow = {
  id: string;
  name: string;
  issuingOrganization: string | null;
  kind: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  jurisdiction: string | null;
  issueDate: Date | null;
  expirationDate: Date | null;
  doesNotExpire: boolean;
  inProgress: boolean;
  verifiedAt: Date | null;
  verifiedBy: { name: string | null; email: string } | null;
  notes: string | null;
};

type Option = { value: string; label: string };

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const labelTextCls = "mb-1 block font-medium text-zinc-600 dark:text-zinc-300";
const btnPrimary =
  "rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";
const btnGhost =
  "rounded-md px-3 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200";
const btnOutline =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className={labelTextCls}>{label}</span>
      {children}
    </label>
  );
}

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/** prettify an UPPER_SNAKE choice value if no explicit label was supplied. */
function titleize(v: string): string {
  return v
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EducationCertificationsSection({
  candidateId,
  education,
  certifications,
  degreeOptions,
  kindOptions,
}: {
  candidateId: string;
  education: EducationRow[];
  certifications: CertificationRow[];
  degreeOptions: Option[];
  kindOptions: Option[];
}) {
  const degreeLabel = labelLookup(degreeOptions);
  const kindLabel = labelLookup(kindOptions);

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Education &amp; certifications
      </div>
      <div className="space-y-8 p-5">
        <EducationBlock
          candidateId={candidateId}
          rows={education}
          degreeOptions={degreeOptions}
          degreeLabel={degreeLabel}
        />
        <CertificationBlock
          candidateId={candidateId}
          rows={certifications}
          kindOptions={kindOptions}
          kindLabel={kindLabel}
        />
      </div>
    </section>
  );
}

function labelLookup(options: Option[]): (value: string | null) => string {
  const map = new Map(options.map((o) => [o.value, o.label]));
  return (value) => (value ? map.get(value) ?? titleize(value) : "");
}

// ---------------- Education ----------------

function EducationBlock({
  candidateId,
  rows,
  degreeOptions,
  degreeLabel,
}: {
  candidateId: string;
  rows: EducationRow[];
  degreeOptions: Option[];
  degreeLabel: (v: string | null) => string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Education ({rows.length})
        </h3>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding((v) => !v);
          }}
          className={btnOutline}
        >
          {adding ? "Cancel" : "Add education"}
        </button>
      </div>

      {adding && (
        <EducationForm
          candidateId={candidateId}
          degreeOptions={degreeOptions}
          onDone={() => setAdding(false)}
        />
      )}

      {rows.length === 0 && !adding ? (
        <p className="text-sm text-zinc-500">No education recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) =>
            editingId === r.id ? (
              <li key={r.id}>
                <EducationForm
                  candidateId={candidateId}
                  degreeOptions={degreeOptions}
                  initial={r}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <EducationItem
                key={r.id}
                row={r}
                degreeLabel={degreeLabel}
                onEdit={() => {
                  setAdding(false);
                  setEditingId(r.id);
                }}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function EducationItem({
  row,
  degreeLabel,
  onEdit,
}: {
  row: EducationRow;
  degreeLabel: (v: string | null) => string;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const years =
    row.startYear || row.endYear
      ? `${row.startYear ?? "?"} – ${row.inProgress ? "Present" : row.endYear ?? "?"}`
      : row.inProgress
        ? "In progress"
        : null;
  const place = [row.locationCity, row.locationCountry].filter(Boolean).join(", ");

  function handleDelete() {
    if (!confirm("Delete this education record?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteEducation(row.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{row.institution}</span>
          {years && <span className="ml-2 text-xs text-zinc-500">{years}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onEdit} className={btnGhost}>
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            {pending ? "…" : "Delete"}
          </button>
        </div>
      </div>
      <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {[degreeLabel(row.degree), row.fieldOfStudy].filter(Boolean).join(" · ")}
        {row.specialization && <span> — {row.specialization}</span>}
      </div>
      {(row.gpa || place || row.honors) && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
          {row.gpa && <span>GPA {row.gpa}</span>}
          {place && <span>{place}</span>}
          {row.honors && <span>{row.honors}</span>}
        </div>
      )}
      {row.notes && (
        <p className="mt-1.5 whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
          {row.notes}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}

function EducationForm({
  candidateId,
  degreeOptions,
  initial,
  onDone,
}: {
  candidateId: string;
  degreeOptions: Option[];
  initial?: EducationRow;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await saveEducation(candidateId, initial?.id ?? null, formData);
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mb-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="School / institution *">
          <input name="institution" required defaultValue={initial?.institution ?? ""} className={inputCls} />
        </Field>
        <Field label="Degree">
          <select name="degree" defaultValue={initial?.degree ?? ""} className={inputCls}>
            <option value="">—</option>
            {degreeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Field of study">
          <input name="fieldOfStudy" defaultValue={initial?.fieldOfStudy ?? ""} placeholder="Computer Science" className={inputCls} />
        </Field>
        <Field label="Specialization / minor">
          <input name="specialization" defaultValue={initial?.specialization ?? ""} className={inputCls} />
        </Field>
        <Field label="Start year">
          <input name="startYear" type="number" min={1900} max={2100} defaultValue={initial?.startYear ?? ""} className={inputCls} />
        </Field>
        <Field label="End year (or expected)">
          <input name="endYear" type="number" min={1900} max={2100} defaultValue={initial?.endYear ?? ""} className={inputCls} />
        </Field>
        <Field label="GPA / grade">
          <input name="gpa" defaultValue={initial?.gpa ?? ""} placeholder="3.8/4.0" className={inputCls} />
        </Field>
        <Field label="Honors / activities">
          <input name="honors" defaultValue={initial?.honors ?? ""} placeholder="Magna cum laude" className={inputCls} />
        </Field>
        <Field label="City">
          <input name="locationCity" defaultValue={initial?.locationCity ?? ""} className={inputCls} />
        </Field>
        <Field label="Country">
          <input name="locationCountry" defaultValue={initial?.locationCountry ?? ""} className={inputCls} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <input type="checkbox" name="inProgress" defaultChecked={initial?.inProgress ?? false} />
        Currently enrolled (in progress)
      </label>
      <Field label="Notes">
        <textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} className={inputCls} />
      </Field>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : initial ? "Save changes" : "Add education"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className={btnGhost}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------- Certifications ----------------

function CertificationBlock({
  candidateId,
  rows,
  kindOptions,
  kindLabel,
}: {
  candidateId: string;
  rows: CertificationRow[];
  kindOptions: Option[];
  kindLabel: (v: string | null) => string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Certifications &amp; licenses ({rows.length})
        </h3>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding((v) => !v);
          }}
          className={btnOutline}
        >
          {adding ? "Cancel" : "Add certification"}
        </button>
      </div>

      {adding && (
        <CertificationForm
          candidateId={candidateId}
          kindOptions={kindOptions}
          onDone={() => setAdding(false)}
        />
      )}

      {rows.length === 0 && !adding ? (
        <p className="text-sm text-zinc-500">No certifications or licenses recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) =>
            editingId === r.id ? (
              <li key={r.id}>
                <CertificationForm
                  candidateId={candidateId}
                  kindOptions={kindOptions}
                  initial={r}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <CertificationItem
                key={r.id}
                row={r}
                kindLabel={kindLabel}
                onEdit={() => {
                  setAdding(false);
                  setEditingId(r.id);
                }}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/** Derive an expiry badge from the expirationDate (not stored — see schema). */
function expiryBadge(row: CertificationRow): { text: string; cls: string } | null {
  if (row.inProgress) {
    return {
      text: "In progress",
      cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    };
  }
  if (row.doesNotExpire) {
    return {
      text: "No expiry",
      cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    };
  }
  if (!row.expirationDate) return null;
  const exp = new Date(row.expirationDate);
  const days = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0)
    return { text: "Expired", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" };
  if (days <= 90)
    return {
      text: `Expires in ${days}d`,
      cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    };
  return {
    text: `Valid to ${exp.toLocaleDateString()}`,
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  };
}

function CertificationItem({
  row,
  kindLabel,
  onEdit,
}: {
  row: CertificationRow;
  kindLabel: (v: string | null) => string;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [verifyPending, startVerify] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const badge = expiryBadge(row);
  const verified = Boolean(row.verifiedAt);

  function handleDelete() {
    if (!confirm("Delete this certification?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCertification(row.id);
      if (!res.ok) setError(res.error);
    });
  }

  function handleVerify() {
    setError(null);
    startVerify(async () => {
      const res = await toggleCertificationVerified(row.id, !verified);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          {row.credentialUrl ? (
            <a
              href={row.credentialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline"
            >
              {row.name}
            </a>
          ) : (
            <span className="text-sm font-medium">{row.name}</span>
          )}
          {row.kind && <span className="ml-2 text-xs text-zinc-500">{kindLabel(row.kind)}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.cls}`}
            >
              {badge.text}
            </span>
          )}
          <button type="button" onClick={onEdit} className={btnGhost}>
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            {pending ? "…" : "Delete"}
          </button>
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {row.issuingOrganization && <span>{row.issuingOrganization}</span>}
        {row.jurisdiction && <span>{row.jurisdiction}</span>}
        {row.credentialId && <span>ID: {row.credentialId}</span>}
        {row.issueDate && <span>Issued {new Date(row.issueDate).toLocaleDateString()}</span>}
      </div>
      {row.notes && (
        <p className="mt-1.5 whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
          {row.notes}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifyPending}
          className={
            verified
              ? "text-[11px] font-medium text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
              : "text-[11px] text-zinc-500 hover:underline disabled:opacity-50"
          }
        >
          {verifyPending
            ? "…"
            : verified
              ? `✓ Verified${row.verifiedBy ? ` by ${row.verifiedBy.name ?? row.verifiedBy.email}` : ""} — undo`
              : "Mark verified"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}

function CertificationForm({
  candidateId,
  kindOptions,
  initial,
  onDone,
}: {
  candidateId: string;
  kindOptions: Option[];
  initial?: CertificationRow;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noExpiry, setNoExpiry] = useState(initial?.doesNotExpire ?? false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await saveCertification(candidateId, initial?.id ?? null, formData);
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mb-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input name="name" required defaultValue={initial?.name ?? ""} placeholder="AWS Solutions Architect – Associate" className={inputCls} />
        </Field>
        <Field label="Issuing organization">
          <input name="issuingOrganization" defaultValue={initial?.issuingOrganization ?? ""} placeholder="Amazon Web Services" className={inputCls} />
        </Field>
        <Field label="Kind">
          <select name="kind" defaultValue={initial?.kind ?? ""} className={inputCls}>
            <option value="">—</option>
            {kindOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jurisdiction (state / country)">
          <input name="jurisdiction" defaultValue={initial?.jurisdiction ?? ""} placeholder="Texas" className={inputCls} />
        </Field>
        <Field label="Credential ID">
          <input name="credentialId" defaultValue={initial?.credentialId ?? ""} className={inputCls} />
        </Field>
        <Field label="Credential URL">
          <input name="credentialUrl" type="url" defaultValue={initial?.credentialUrl ?? ""} placeholder="https://…" className={inputCls} />
        </Field>
        <Field label="Issued">
          <input name="issueDate" type="date" defaultValue={toDateInput(initial?.issueDate ?? null)} className={inputCls} />
        </Field>
        <Field label="Expires">
          <input
            name="expirationDate"
            type="date"
            defaultValue={toDateInput(initial?.expirationDate ?? null)}
            disabled={noExpiry}
            className={`${inputCls} disabled:opacity-50`}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            name="doesNotExpire"
            checked={noExpiry}
            onChange={(e) => setNoExpiry(e.target.checked)}
          />
          No expiry (lifetime)
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" name="inProgress" defaultChecked={initial?.inProgress ?? false} />
          In progress (pursuing)
        </label>
      </div>
      <Field label="Notes">
        <textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} className={inputCls} />
      </Field>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : initial ? "Save changes" : "Add certification"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className={btnGhost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
