"use client";

import { useState, useTransition } from "react";
import { ContactRole, ContactStatus } from "@/generated/prisma";
import { tagClass } from "@/lib/tag-colors";
import { TagInput } from "@/components/TagInput";
import {
  addContact,
  updateContact,
  deleteContact,
  markContactContacted,
} from "../actions";

type Tag = { id: string; name: string; color: string };

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
  role: ContactRole | null;
  linkedinUrl: string | null;
  status: ContactStatus;
  lastContactedAt: Date | null;
  birthday: Date | null;
  notes: string | null;
  tags: Tag[];
};

const ROLE_LABEL: Record<ContactRole, string> = {
  DECISION_MAKER: "Decision Maker",
  INFLUENCER: "Influencer",
};

const STATUS_LABEL: Record<ContactStatus, string> = {
  ACTIVE: "Active",
  LEFT_COMPANY: "Left company",
  DO_NOT_CONTACT: "Do not contact",
};

const STATUS_STYLE: Record<ContactStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  LEFT_COMPANY: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  DO_NOT_CONTACT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

function formatRelativeDate(date: Date) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatBirthday(date: Date) {
  return new Date(date).toLocaleString("en-US", { month: "long", day: "numeric" });
}

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

export function ContactsSection({
  clientId,
  contacts,
  allTags,
}: {
  clientId: string;
  contacts: Contact[];
  allTags: Tag[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Contacts ({contacts.length})
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium"
          >
            Add contact
          </button>
        )}
      </div>

      {adding && (
        <ContactForm
          clientId={clientId}
          allTags={allTags}
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}

      {contacts.length === 0 && !adding ? (
        <p className="text-sm text-zinc-500">No contacts yet.</p>
      ) : (
        <ul className="space-y-3">
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} allTags={allTags} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ContactRow({ contact, allTags }: { contact: Contact; allTags: Tag[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <li>
        <ContactForm
          contact={contact}
          allTags={allTags}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">
              {contact.firstName} {contact.lastName}
            </span>
            {contact.title && <span className="text-sm text-zinc-500">· {contact.title}</span>}
            {contact.department && (
              <span className="text-sm text-zinc-500">· {contact.department}</span>
            )}
            {contact.role && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                  contact.role === ContactRole.DECISION_MAKER
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                    : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                }`}
              >
                {ROLE_LABEL[contact.role]}
              </span>
            )}
            {contact.status !== ContactStatus.ACTIVE && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_STYLE[contact.status]}`}
              >
                {STATUS_LABEL[contact.status]}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400 flex-wrap">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="hover:underline">
                {contact.email}
              </a>
            )}
            {contact.phone && <span>{contact.phone}</span>}
            {contact.linkedinUrl && (
              <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">
                LinkedIn
              </a>
            )}
            {contact.birthday && (
              <span className="text-xs text-zinc-500">🎂 {formatBirthday(contact.birthday)}</span>
            )}
          </div>
          {contact.tags.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {contact.tags.map((t) => (
                <span
                  key={t.id}
                  className={`rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 text-xs text-zinc-500">
            {contact.lastContactedAt
              ? `Last contacted ${formatRelativeDate(contact.lastContactedAt)}`
              : "Not yet contacted"}
          </div>
          {contact.notes && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {contact.notes}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            type="button"
            disabled={pending || contact.status === ContactStatus.DO_NOT_CONTACT}
            onClick={() => startTransition(() => markContactContacted(contact.id))}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 text-xs font-medium disabled:opacity-40"
            title={
              contact.status === ContactStatus.DO_NOT_CONTACT
                ? "This contact has asked not to be contacted"
                : "Stamp 'last contacted' with the current time"
            }
          >
            Mark contacted
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete ${contact.firstName} ${contact.lastName}?`)) return;
                startTransition(() => deleteContact(contact.id));
              }}
              className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function ContactForm({
  clientId,
  contact,
  allTags,
  onCancel,
  onSaved,
}: {
  clientId?: string;
  contact?: Contact;
  allTags: Tag[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          if (contact) {
            await updateContact(contact.id, fd);
          } else if (clientId) {
            await addContact(clientId, fd);
          }
          onSaved();
        });
      }}
      className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="First name" name="firstName" required defaultValue={contact?.firstName} />
        <Field label="Last name" name="lastName" required defaultValue={contact?.lastName} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Email" name="email" type="email" defaultValue={contact?.email ?? ""} />
        <Field label="Phone" name="phone" defaultValue={contact?.phone ?? ""} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title" name="title" defaultValue={contact?.title ?? ""} placeholder="VP Engineering" />
        <Field label="Department" name="department" defaultValue={contact?.department ?? ""} placeholder="Engineering" />
      </div>
      <Field
        label="LinkedIn URL"
        name="linkedinUrl"
        defaultValue={contact?.linkedinUrl ?? ""}
        placeholder="https://www.linkedin.com/in/..."
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="role">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue={contact?.role ?? ""}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">— Not set —</option>
            <option value={ContactRole.DECISION_MAKER}>Decision Maker</option>
            <option value={ContactRole.INFLUENCER}>Influencer</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={contact?.status ?? ContactStatus.ACTIVE}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value={ContactStatus.ACTIVE}>Active</option>
            <option value={ContactStatus.LEFT_COMPANY}>Left company</option>
            <option value={ContactStatus.DO_NOT_CONTACT}>Do not contact</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="birthday">
            Birthday
          </label>
          <input
            id="birthday"
            name="birthday"
            type="date"
            defaultValue={toDateInputValue(contact?.birthday)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Tags</label>
        <TagInput allTags={allTags} defaultValue={contact?.tags ?? []} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="notes">
          Comments / notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={contact?.notes ?? ""}
          placeholder="Anything to remember about this contact — preferences, history, who they report to…"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : contact ? "Save changes" : "Add contact"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      />
    </div>
  );
}
