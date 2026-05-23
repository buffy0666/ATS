/**
 * Small presentational pieces shared across the Row 1 cards.
 * Kept as their own file so the load + render code in each card stays focused.
 */

export function CardHeader({ label, count }: { label: string; count: number }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className={`mt-1 text-3xl font-semibold ${
          count === 0 ? "text-zinc-400 dark:text-zinc-600" : ""
        }`}
      >
        {count}
      </div>
    </div>
  );
}

export function CardEmpty({ text }: { text: string }) {
  return <p className="mt-3 text-sm text-zinc-500">{text}</p>;
}

export function CardViewAll({ label = "View all →" }: { label?: string }) {
  return (
    <div className="mt-4 text-xs text-zinc-500">{label}</div>
  );
}
