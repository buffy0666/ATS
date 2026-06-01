"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { KnowledgeStatus, Role } from "@/generated/prisma";
import { deleteKnowledgeItem, setKnowledgeStatus } from "./actions";
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_TYPES } from "./constants";

export type KnowledgeRow = {
  id: string;
  name: string;
  description: string | null;
  type: string; // "document" | "link"
  category: string | null;
  url: string;
  status: KnowledgeStatus;
  createdAt: Date;
  createdBy: { id: string; name: string | null; email: string } | null;
  attachmentCount: number;
};

const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
};

const STATUS_BADGE: Record<KnowledgeStatus, string> = {
  UNDER_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

export function KnowledgeTable({
  items,
  currentUserId,
  currentUserRole,
}: {
  items: KnowledgeRow[];
  currentUserId: string;
  currentUserRole: Role;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | KnowledgeStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // ADMIN or OWNER can approve / delete any item; recruiters can only
  // delete their own and never approve.
  const isAdmin = currentUserRole === Role.ADMIN || currentUserRole === Role.OWNER;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== "ALL" && it.status !== statusFilter) return false;
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      if (categoryFilter !== "all" && it.category !== categoryFilter) return false;
      if (q) {
        const hay =
          `${it.name} ${it.description ?? ""} ${it.createdBy?.name ?? ""} ${it.createdBy?.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, statusFilter, typeFilter, categoryFilter]);

  function approve(itemId: string) {
    startTransition(async () => {
      try {
        await setKnowledgeStatus(itemId, KnowledgeStatus.APPROVED);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not approve item.");
      }
    });
  }

  function revert(itemId: string) {
    startTransition(async () => {
      try {
        await setKnowledgeStatus(itemId, KnowledgeStatus.UNDER_REVIEW);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not update item.");
      }
    });
  }

  function handleDelete(itemId: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteKnowledgeItem(itemId);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not delete item.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, description, or added-by…"
          className="flex-1 min-w-60 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value={KnowledgeStatus.UNDER_REVIEW}>Under review</option>
          <option value={KnowledgeStatus.APPROVED}>Approved</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="all">All types</option>
          {KNOWLEDGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {KNOWLEDGE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {(query || statusFilter !== "ALL" || typeFilter !== "all" || categoryFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("ALL");
              setTypeFilter("all");
              setCategoryFilter("all");
            }}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="text-xs text-zinc-500">
        {filtered.length} item{filtered.length === 1 ? "" : "s"}
        {filtered.length !== items.length ? ` (of ${items.length})` : ""}
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Link / File</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">Created</th>
              <th className="px-4 py-2 font-medium">Added by</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-500">
                  {items.length === 0
                    ? "No items yet. Click \"Add new item\" to start."
                    : "No items match those filters."}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const canModify = isAdmin || item.createdBy?.id === currentUserId;
                return (
                  <tr
                    key={item.id}
                    className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/knowledge/${item.id}`}
                        className="font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="inline-block rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 px-2 py-0.5 text-[10px] font-medium">
                          {item.type}
                        </span>
                        {item.category && (
                          <span className="inline-block rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 px-2 py-0.5 text-[10px] font-medium">
                            {item.category}
                          </span>
                        )}
                        {item.attachmentCount > 0 && (
                          <span className="inline-block rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 px-2 py-0.5 text-[10px] font-medium">
                            {item.attachmentCount} file{item.attachmentCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 max-w-md">
                      {item.description ? (
                        <span className="line-clamp-2">{item.description}</span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                        >
                          {truncate(item.url, 50)}
                        </a>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {item.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {item.createdBy?.name ?? item.createdBy?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[item.status]}`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 text-xs">
                        {isAdmin && item.status === KnowledgeStatus.UNDER_REVIEW && (
                          <button
                            type="button"
                            onClick={() => approve(item.id)}
                            disabled={pending}
                            className="rounded-md border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-2 py-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {isAdmin && item.status === KnowledgeStatus.APPROVED && (
                          <button
                            type="button"
                            onClick={() => revert(item.id)}
                            disabled={pending}
                            className="rounded-md border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-2 py-1 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                          >
                            Un-approve
                          </button>
                        )}
                        {canModify && (
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.name)}
                            disabled={pending}
                            className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
