/**
 * Shared formatters for the salary range + placement fee on Job. The fee
 * dollar amount is always derived on read so we never have to keep two fields
 * in sync.
 */

export function formatSalaryRange(low: number | null, high: number | null): string | null {
  if (low == null && high == null) return null;
  if (low != null && high != null) {
    return `${low.toLocaleString()}-${high.toLocaleString()} USD`;
  }
  if (low != null) return `${low.toLocaleString()}+ USD`;
  return `up to ${high!.toLocaleString()} USD`;
}

export function estimatedPlacementFee(
  salaryLow: number | null,
  placementFeePercent: number | null,
): number | null {
  if (salaryLow == null || placementFeePercent == null) return null;
  return Math.round((salaryLow * placementFeePercent) / 100);
}

export function formatUSD(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString()}`;
}
