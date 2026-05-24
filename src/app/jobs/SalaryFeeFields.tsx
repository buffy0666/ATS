"use client";

import { useState } from "react";
import { estimatedPlacementFee, formatSalaryRange, formatUSD } from "./job-money";

export function SalaryFeeFields({
  defaultLow,
  defaultHigh,
  defaultPercent,
}: {
  defaultLow?: number | null;
  defaultHigh?: number | null;
  defaultPercent?: number | null;
}) {
  const [low, setLow] = useState(defaultLow ?? "");
  const [high, setHigh] = useState(defaultHigh ?? "");
  const [percent, setPercent] = useState(defaultPercent ?? "");

  const lowNum = parseIntOrNull(String(low));
  const highNum = parseIntOrNull(String(high));
  const percentNum = parseIntOrNull(String(percent));

  const range = formatSalaryRange(lowNum, highNum);
  const fee = estimatedPlacementFee(lowNum, percentNum);

  return (
    <fieldset className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Compensation &amp; placement fee
      </legend>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="salaryLow">
            Salary range — low (USD)
          </label>
          <input
            id="salaryLow"
            name="salaryLow"
            type="number"
            min={0}
            step={1000}
            placeholder="120000"
            value={low}
            onChange={(e) => setLow(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="salaryHigh">
            Salary range — high (USD)
          </label>
          <input
            id="salaryHigh"
            name="salaryHigh"
            type="number"
            min={0}
            step={1000}
            placeholder="150000"
            value={high}
            onChange={(e) => setHigh(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="placementFeePercent">
          Placement fee (%)
        </label>
        <input
          id="placementFeePercent"
          name="placementFeePercent"
          type="number"
          min={0}
          max={100}
          step={1}
          placeholder="20"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          className="w-full sm:w-40 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <DerivedField label="Salary range" value={range ?? "—"} />
        <DerivedField
          label="Est. placement fee"
          value={fee != null ? `${formatUSD(fee)} (low × ${percentNum}%)` : "—"}
        />
      </div>
    </fieldset>
  );
}

function DerivedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}
