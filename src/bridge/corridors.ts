import type { Corridor, FiatCurrency, FxQuote, LedgerTokenId, RampIntent } from '../types';

const DEFAULT_USD_INR = 83.5;

export function tokenForCorridor(corridor: Corridor): LedgerTokenId {
  return corridor === 'US' ? 'NIDHI-USD' : 'NIDHI-INR';
}

export function fiatForCorridor(corridor: Corridor): FiatCurrency {
  return corridor === 'US' ? 'USD' : 'INR';
}

/**
 * Detect corridor from locale / dial hints. App may override.
 * Examples: en-US → US, en-IN / hi-IN → IN.
 */
export function detectCorridor(input?: {
  locale?: string;
  countryCode?: string;
}): Corridor {
  const country = (input?.countryCode || '').toUpperCase();
  if (country === 'US' || country === 'USA') return 'US';
  if (country === 'IN' || country === 'IND') return 'IN';

  const locale = (input?.locale || '').toLowerCase();
  if (locale.endsWith('-us') || locale === 'en-us') return 'US';
  if (locale.endsWith('-in') || locale.startsWith('hi') || locale === 'en-in') return 'IN';

  // Safe default for Annadata India-first stalls; US users set corridor explicitly.
  return 'IN';
}

export interface QuoteFxInput {
  corridor: Corridor;
  from: FiatCurrency | LedgerTokenId;
  to: FiatCurrency | LedgerTokenId;
  amount: string;
  /** USD→INR mid; inject oracle later. */
  usdInrRate?: number;
  ttlMs?: number;
}

function isUsdSide(x: string): boolean {
  return x === 'USD' || x === 'NIDHI-USD';
}

function isInrSide(x: string): boolean {
  return x === 'INR' || x === 'NIDHI-INR';
}

/**
 * Local quote helper — not a live FX feed.
 * Same-currency ramp is 1:1; cross uses usdInrRate.
 */
export function quoteFx(input: QuoteFxInput): FxQuote {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('FX amount must be positive');
  }
  const rate =
    isUsdSide(input.from) && isInrSide(input.to)
      ? input.usdInrRate ?? DEFAULT_USD_INR
      : isInrSide(input.from) && isUsdSide(input.to)
        ? 1 / (input.usdInrRate ?? DEFAULT_USD_INR)
        : 1;

  const amountOut = (amount * rate).toFixed(6).replace(/\.?0+$/, '');
  const now = Date.now();
  return {
    corridor: input.corridor,
    from: input.from,
    to: input.to,
    rate: String(rate),
    amountIn: input.amount,
    amountOut,
    quotedAt: now,
    expiresAt: now + (input.ttlMs ?? 60_000),
  };
}

export function buildOnRampIntent(input: {
  corridor: Corridor;
  fiatAmount: string;
  usdInrRate?: number;
}): RampIntent {
  const fiat = fiatForCorridor(input.corridor);
  const token = tokenForCorridor(input.corridor);
  const quote = quoteFx({
    corridor: input.corridor,
    from: fiat,
    to: token,
    amount: input.fiatAmount,
    usdInrRate: input.usdInrRate,
  });
  return {
    corridor: input.corridor,
    direction: 'onramp',
    fiatCurrency: fiat,
    tokenId: token,
    fiatAmount: input.fiatAmount,
    tokenAmount: quote.amountOut,
    quote,
  };
}

export function buildOffRampIntent(input: {
  corridor: Corridor;
  tokenAmount: string;
  usdInrRate?: number;
}): RampIntent {
  const fiat = fiatForCorridor(input.corridor);
  const token = tokenForCorridor(input.corridor);
  const quote = quoteFx({
    corridor: input.corridor,
    from: token,
    to: fiat,
    amount: input.tokenAmount,
    usdInrRate: input.usdInrRate,
  });
  return {
    corridor: input.corridor,
    direction: 'offramp',
    fiatCurrency: fiat,
    tokenId: token,
    fiatAmount: quote.amountOut,
    tokenAmount: input.tokenAmount,
    quote,
  };
}

/** Human labels for treasury accounts (ops — not ledger). */
export const TREASURY_LABELS = {
  US: 'annadata.ai USA bank account',
  IN: 'annadata.ai India bank account',
} as const;
