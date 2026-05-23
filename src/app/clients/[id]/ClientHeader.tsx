"use client";

import { useState, useTransition } from "react";
import { ClientStatus, CompanySize, RevenueBand } from "@/generated/prisma";
import { tagClass } from "@/lib/tag-colors";
import { updateClient, deleteClient } from "../actions";
import { ClientFormFields } from "../ClientFormFields";

type Owner = { id: string; name: string | null; email: string };
type Tag = { id: string; name: string; color: string };

type Client = {
  id: string;
  name: string;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  location: string | null;
  address: string | null;
  phone: string | null;
  companySize: CompanySize | null;
  revenueBand: RevenueBand | null;
  status: ClientStatus;
  ownerId: string | null;
  notes: string | null;
  owner: { id: string; name: string | null; email: string } | null;
  tags: Tag[];
};

const STATUS_LABEL: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  FORMER: "Former",
};

const STATUS_STYLE: Record<ClientStatus, string> = {
  PROSPECT: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  INACTIVE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  FORMER: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const COMPANY_SIZE_LABEL: Record<CompanySize, string> = {
  ONE_TO_TEN: "1–10",
  ELEVEN_TO_FIFTY: "11–50",
  FIFTY_ONE_TO_TWO_HUNDRED: "51–200",
  TWO_HUNDRED_ONE_TO_FIVE_HUNDRED: "201–500",
  FIVE_HUNDRED_ONE_TO_ONE_THOUSAND: "501–1,000",
  ONE_THOUSAND_PLUS: "1,000+",
};

const REVENUE_BAND_LABEL: Record<RevenueBand, string> = {
  UNDER_1M: "Under $1M",
  ONE_TO_10M: "$1M–$10M",
  TEN_TO_50M: "$10M–$50M",
  FIFTY_TO_250M: "$50M–$250M",
  TWO_FIFTY_M_TO_1B: "$250M–$1B",
  OVER_1B: "Over $1B",
};

export function ClientHeader({
  client,
  owners,
  allTags,
}: {
  client: Client;
  owners: Owner[];
  allTags: Tag[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={(fd) => {
          startTransition(async () => {
            await updateClient(client.id, fd);
            setEditing(false);
          });
        }}
        className="mt-3 space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
      >
        <ClientFormFields owners={owners} allTags={allTags} defaults={client} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const sizeRev = [
    client.companySize && COMPANY_SIZE_LABEL[client.companySize],
    client.revenueBand && REVENUE_BAND_LABEL[client.revenueBand],
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-1">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">{client.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_STYLE[client.status]}`}
            >
              {STATUS_LABEL[client.status]}
            </span>
          </div>
          <div className="text-sm text-zinc-500 mt-1 flex items-center gap-3 flex-wrap">
            {client.industry && <span>{client.industry}</span>}
            {client.location && <span>· {client.location}</span>}
            {sizeRev && <span>· {sizeRev}</span>}
            {client.owner && (
              <span>· Owner: {client.owner.name ?? client.owner.email}</span>
            )}
          </div>
          {client.tags.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {client.tags.map((t) => (
                <span
                  key={t.id}
                  className={`rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
          <div className="text-sm mt-2 flex items-center gap-4 flex-wrap">
            {client.website && (
              <a href={client.website} target="_blank" rel="noopener noreferrer" className="underline text-zinc-700 dark:text-zinc-300">
                Website
              </a>
            )}
            {client.linkedinUrl && (
              <a href={client.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline text-zinc-700 dark:text-zinc-300">
                LinkedIn
              </a>
            )}
            {client.phone && <span className="text-zinc-700 dark:text-zinc-300">{client.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete client "${client.name}"? This cannot be undone.`)) return;
              startTransition(() => deleteClient(client.id));
            }}
            className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
      {client.address && (
        <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Address</div>
          <p className="whitespace-pre-wrap text-sm">{client.address}</p>
        </div>
      )}
      {client.notes && (
        <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Notes</div>
          <p className="whitespace-pre-wrap text-sm">{client.notes}</p>
        </div>
      )}
    </div>
  );
}
