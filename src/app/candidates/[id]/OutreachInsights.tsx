"use client";

import { useState } from "react";

/**
 * Renders the AI-extracted outreach personalization hooks plus the parsed
 * LinkedIn activity feed. Each hook has a "Copy" button that lifts its
 * suggested opener onto the clipboard so the recruiter can paste straight
 * into an email or LinkedIn message.
 */

export type OutreachInsight = {
  hook: string;
  source: string;
  suggestedOpener: string;
  tone: "congratulatory" | "curious" | "professional" | "casual" | "shared-interest";
};

export type ActivityItem = {
  kind: "post" | "comment" | "reaction" | "repost" | "article";
  text: string;
  categories?: string[];
  when?: string;
};

const TONE_BADGE: Record<OutreachInsight["tone"], string> = {
  congratulatory: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  curious: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  professional: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  casual: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "shared-interest": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  post: "Post",
  comment: "Comment",
  reaction: "Reaction",
  repost: "Repost",
  article: "Article",
};

export function OutreachInsights({
  insights,
  activity,
}: {
  insights: OutreachInsight[];
  activity: ActivityItem[];
}) {
  if (insights.length === 0 && activity.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No LinkedIn personalization signals yet. Run the Chrome extension on a profile to populate this.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {insights.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Outreach hooks ({insights.length})
          </h3>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <InsightRow key={i} insight={insight} />
            ))}
          </ul>
        </section>
      )}

      {activity.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Recent LinkedIn activity ({activity.length})
          </h3>
          <ul className="space-y-2">
            {activity.map((item, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-zinc-500 mb-1">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {KIND_LABEL[item.kind]}
                  </span>
                  {item.when && <span>· {item.when}</span>}
                  {item.categories?.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InsightRow({ insight }: { insight: OutreachInsight }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(insight.suggestedOpener);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard API can be unavailable on insecure origins.
    }
  }

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {insight.hook}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE_BADGE[insight.tone]}`}
            >
              {insight.tone.replace("-", " ")}
            </span>
            <span className="text-[10px] text-zinc-400">from {insight.source}</span>
          </div>
          <p className="mt-1.5 text-sm italic text-zinc-600 dark:text-zinc-300">
            &ldquo;{insight.suggestedOpener}&rdquo;
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          title="Copy suggested opener to clipboard"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </li>
  );
}
