"use client";

import Link from "next/link";
import { useState } from "react";
import type { ToolCall } from "./types";

export function ToolCallCard({ call }: { call: ToolCall }) {
  const [showArgs, setShowArgs] = useState(false);

  return (
    <div className="my-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 text-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate">
            {call.name}
          </span>
          <StateBadge state={call.state} />
        </div>
        <button
          type="button"
          onClick={() => setShowArgs((s) => !s)}
          className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
        >
          {showArgs ? "Hide args" : "Args"}
        </button>
      </div>

      {showArgs && (
        <pre className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400">
          {JSON.stringify(call.arguments, null, 2)}
        </pre>
      )}

      {call.state === "pending" && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-500 italic">
          Running…
        </div>
      )}

      {call.state === "error" && (
        <div className="border-t border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {call.errorMessage ?? "Tool call failed."}
        </div>
      )}

      {call.state === "ok" && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2">
          <ToolResultRenderer name={call.name} result={call.result} />
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: ToolCall["state"] }) {
  const map: Record<ToolCall["state"], string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    needs_approval: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  };
  const label: Record<ToolCall["state"], string> = {
    pending: "Running",
    ok: "Done",
    error: "Failed",
    needs_approval: "Needs approval",
  };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${map[state]}`}>
      {label[state]}
    </span>
  );
}

type Candidate = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
  currentTitle?: string | null;
  currentCompany?: string | null;
};

type ListResult = { ok: boolean; listId?: string; listName?: string };
type EmailResult = { ok: boolean; messageId?: string };
type CountResult = { count?: number };

/**
 * Tries to render structured results nicely. Falls back to JSON when we don't
 * recognise the shape — better than nothing, the user can still inspect.
 */
function ToolResultRenderer({ name, result }: { name: string; result: unknown }) {
  if (result == null) {
    return <span className="text-xs text-zinc-500">No result.</span>;
  }

  // Candidate search / list — array of candidate-ish records.
  if (Array.isArray(result) && result.length > 0 && isCandidate(result[0])) {
    return <CandidateTable candidates={result as Candidate[]} />;
  }

  // Single candidate fetch.
  if (typeof result === "object" && result !== null && isCandidate(result)) {
    return <CandidateTable candidates={[result as Candidate]} />;
  }

  // create_list / similar { ok, listId, listName }.
  if (typeof result === "object" && result !== null && "ok" in result && "listId" in result) {
    const r = result as ListResult;
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 uppercase tracking-wide ${
            r.ok
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
          }`}
        >
          {r.ok ? "Success" : "Failed"}
        </span>
        {r.listId && (
          <Link href={`/lists/${r.listId}`} className="underline">
            {r.listName ?? "Open list"}
          </Link>
        )}
      </div>
    );
  }

  // Email send result.
  if (
    typeof result === "object" &&
    result !== null &&
    "ok" in result &&
    "messageId" in result &&
    (name.toLowerCase().includes("email") || name.toLowerCase().includes("send"))
  ) {
    const r = result as EmailResult;
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 uppercase tracking-wide ${
            r.ok
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
          }`}
        >
          {r.ok ? "Sent" : "Failed"}
        </span>
        {r.messageId && (
          <span className="font-mono text-[11px] text-zinc-500 truncate">{r.messageId}</span>
        )}
      </div>
    );
  }

  // Plain count / scalar.
  if (typeof result === "object" && result !== null && "count" in result) {
    const r = result as CountResult;
    return (
      <div className="text-xs text-zinc-700 dark:text-zinc-300">
        Count: <span className="font-medium">{r.count ?? 0}</span>
      </div>
    );
  }

  // Fallback — raw JSON.
  return (
    <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function isCandidate(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    "id" in v &&
    ("email" in v || "firstName" in v || "lastName" in v)
  );
}

function CandidateTable({ candidates }: { candidates: Candidate[] }) {
  return (
    <div className="overflow-x-auto -mx-3 -mb-2">
      <table className="w-full text-xs">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="px-3 py-1.5 font-medium">Name</th>
            <th className="px-3 py-1.5 font-medium">Title</th>
            <th className="px-3 py-1.5 font-medium">Status</th>
            <th className="px-3 py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.id} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-3 py-1.5">
                <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                  {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.id}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">
                {[c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ") || "—"}
              </td>
              <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{c.status ?? "—"}</td>
              <td className="px-3 py-1.5 text-right">
                <Link
                  href={`/candidates/${c.id}`}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
