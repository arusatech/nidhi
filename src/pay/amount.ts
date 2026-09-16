/** Decimal amount helpers (string ledger units). */

const AMOUNT_RE = /^\d+(\.\d+)?$/;

export function isPositiveAmount(amount: string): boolean {
  return AMOUNT_RE.test(amount) && Number(amount) > 0;
}

export function normalizeAmount(amount: string | number): string {
  return Number(amount).toFixed(6).replace(/\.?0+$/, '');
}

export function addAmount(a: string, b: string): string {
  return normalizeAmount(Number(a) + Number(b));
}

export function subAmount(a: string, b: string): string {
  const n = Number(a) - Number(b);
  if (n < -1e-9) throw new Error('Insufficient funds');
  return normalizeAmount(n);
}

/** Passbook replay — does not throw if a snapshot is missing. */
export function subAmountUnchecked(a: string, b: string): string {
  return normalizeAmount(Number(a) - Number(b));
}

export function compareAmount(a: string, b: string): number {
  const d = Number(a) - Number(b);
  if (Math.abs(d) < 1e-9) return 0;
  return d < 0 ? -1 : 1;
}
