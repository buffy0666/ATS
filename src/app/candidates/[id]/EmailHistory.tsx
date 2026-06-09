import { EmailDirection, EmailStatus } from "@/generated/prisma";

type EmailLogRow = {
  id: string;
  subject: string;
  bodyText: string | null;
  to: string;
  status: EmailStatus;
  direction: EmailDirection;
  fromEmail: string | null;
  errorMessage: string | null;
  provider: string;
  providerMessageId: string | null;
  sentAt: Date;
  openedAt: Date | null;
  firstClickedAt: Date | null;
  repliedAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  fromUser: { name: string | null; email: string } | null;
  application: { job: { title: string } } | null;
};

function formatRelative(date: Date) {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export function EmailHistory({ emails }: { emails: EmailLogRow[] }) {
  if (emails.length === 0) {
    return <p className="text-sm text-zinc-500">No emails yet.</p>;
  }

  // Show roughly three rows without scrolling; older emails reachable via
  // the inner scrollbar so the candidate page doesn't stretch indefinitely
  // on chatty threads.
  const MAX_VISIBLE_HEIGHT = "min(60vh, 19rem)";

  return (
    <ul
      className="space-y-2 overflow-y-auto pr-1"
      style={{ maxHeight: MAX_VISIBLE_HEIGHT }}
    >
      {emails.map((e) => {
        const inbound = e.direction === EmailDirection.INBOUND;
        return (
        <li key={e.id}>
          <details className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{e.subject}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {inbound
                    ? <>Received from {e.fromEmail ?? "candidate"}</>
                    : <>Sent by {e.fromUser?.name ?? e.fromUser?.email ?? "you"}</>}
                  {" · "}
                  {formatRelative(e.sentAt)}
                  {e.application && <> · re: {e.application.job.title}</>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inbound ? (
                  <span className="rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 px-2 py-0.5 text-xs uppercase tracking-wide">
                    Received
                  </span>
                ) : e.status === EmailStatus.SENT ? (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 px-2 py-0.5 text-xs uppercase tracking-wide">
                    Sent
                  </span>
                ) : (
                  <span className="rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 px-2 py-0.5 text-xs uppercase tracking-wide">
                    Failed
                  </span>
                )}
                <span className="text-xs text-zinc-400 group-open:rotate-180 transition-transform">▾</span>
              </div>
            </summary>
            {/* Engagement badges (outbound only) — stamped by the Resend webhook. */}
            {!inbound && (e.openedAt || e.firstClickedAt || e.repliedAt || e.bouncedAt || e.complainedAt) && (
              <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
                {e.repliedAt && <EngBadge tone="violet">Replied</EngBadge>}
                {e.firstClickedAt && <EngBadge tone="indigo">Clicked</EngBadge>}
                {e.openedAt && <EngBadge tone="sky">Opened</EngBadge>}
                {e.bouncedAt && <EngBadge tone="amber">Bounced</EngBadge>}
                {e.complainedAt && <EngBadge tone="red">Spam</EngBadge>}
              </div>
            )}
            <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm">
              <div className="text-xs text-zinc-500 mb-2">
                {inbound ? (
                  <>From: <span className="font-mono break-all">{e.fromEmail ?? "—"}</span></>
                ) : (
                  <>To: <span className="font-mono break-all">{e.to}</span></>
                )}
                {" · via "}{e.provider}
                {e.providerMessageId && (
                  <> · id <code className="font-mono">{e.providerMessageId.slice(0, 16)}…</code></>
                )}
              </div>
              {e.errorMessage && (
                <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-3 py-2 text-xs mb-2">
                  {e.errorMessage}
                </div>
              )}
              <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                {e.bodyText}
              </p>
            </div>
          </details>
        </li>
        );
      })}
    </ul>
  );
}

function EngBadge({
  tone,
  children,
}: {
  tone: "sky" | "indigo" | "violet" | "amber" | "red";
  children: React.ReactNode;
}) {
  const cls: Record<typeof tone, string> = {
    sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls[tone]}`}>
      {children}
    </span>
  );
}
