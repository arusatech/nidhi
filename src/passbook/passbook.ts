import type { FabricGateway, FabricTxRecord } from '../fabric/gateway';
import { addAmount, subAmountUnchecked } from '../pay/amount';
import type { LedgerTokenId, NidhiAccountId } from '../types';

export type PassbookRowKind = 'bf' | 'entry' | 'cf';

export interface PassbookRow {
  kind: PassbookRowKind;
  date: string;
  timestamp: number;
  particulars: string;
  chequeOrRefNo: string;
  /** Debit / withdrawal; empty string if this row is a credit or B/F / C/F. */
  withdrawal: string;
  /** Credit / deposit; empty string if this row is a debit or B/F / C/F. */
  deposit: string;
  balance: string;
  initials?: string;
}

export interface PassbookPage {
  pageNumber: number;
  accountId: NidhiAccountId;
  tokenId: LedgerTokenId;
  rows: PassbookRow[];
  broughtForward: string;
  carriedForward: string;
}

export interface Passbook {
  accountId: NidhiAccountId;
  tokenId: LedgerTokenId;
  pages: PassbookPage[];
  closingBalance: string;
}

export const PASSBOOK_COLUMNS = [
  { key: 'date', label: 'Date', description: 'The date on which the transaction was processed and recorded.' },
  {
    key: 'particulars',
    label: 'Particulars / Description',
    description: 'Details explaining the nature of the transaction.',
  },
  {
    key: 'chequeOrRefNo',
    label: 'Cheque No. / Ref No.',
    description: 'Cheque number or electronic reference number.',
  },
  {
    key: 'withdrawal',
    label: 'Withdrawal / Debit (Dr)',
    description: 'Amount taken out of the account.',
  },
  {
    key: 'deposit',
    label: 'Deposit / Credit (Cr)',
    description: 'Amount added to the account.',
  },
  {
    key: 'balance',
    label: 'Balance',
    description: 'Remaining amount immediately after the transaction.',
  },
  {
    key: 'initials',
    label: 'Initials / Signature',
    description: 'Optional teller or system identifier.',
  },
] as const;

export const PASSBOOK_ABBREVIATIONS = {
  Cr: 'Credit — money coming into your account',
  Dr: 'Debit — money going out of your account',
  'B/F': 'Brought Forward — closing balance from previous page or period',
  'C/F': 'Carried Forward — balance moved to the next page when a page gets full',
} as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatPassbookDate(timestamp: number): string {
  const d = new Date(timestamp);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${dd}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export function formatPassbookAmount(amount: string, tokenId: LedgerTokenId): string {
  const n = Number(amount);
  const formatted =
    tokenId === 'NIDHI-INR'
      ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return tokenId === 'NIDHI-INR' ? `₹${formatted}` : `$${formatted}`;
}

function ledgerRow(
  kind: PassbookRowKind,
  timestamp: number,
  particulars: string,
  chequeOrRefNo: string,
  withdrawal: string,
  deposit: string,
  balance: string,
  initials?: string
): PassbookRow {
  return {
    kind,
    date: kind === 'entry' ? formatPassbookDate(timestamp) : '',
    timestamp,
    particulars,
    chequeOrRefNo,
    withdrawal,
    deposit,
    balance,
    initials,
  };
}

function entryFromTx(
  accountId: NidhiAccountId,
  tx: FabricTxRecord,
  running: string
): { row: PassbookRow; running: string } {
  const debit = tx.from === accountId && tx.to !== accountId;
  const credit = tx.to === accountId && tx.from !== accountId;
  const particulars =
    tx.particulars ||
    (debit ? `TO TRANSFER / ${tx.to}` : credit ? `BY TRANSFER / ${tx.from}` : `SELF / ${tx.from}`);
  const ref = tx.chequeOrRefNo || tx.nonce;
  const initials = tx.initials;

  if (debit) {
    // Always replay from running balance so a stale receipt snapshot cannot
    // desync the passbook from the ordered ledger history.
    const next = subAmountUnchecked(running, tx.amount);
    return {
      running: next,
      row: ledgerRow('entry', tx.timestamp, particulars, ref, tx.amount, '', next, initials),
    };
  }
  if (credit) {
    const next = addAmount(running, tx.amount);
    return {
      running: next,
      row: ledgerRow('entry', tx.timestamp, particulars, ref, '', tx.amount, next, initials),
    };
  }
  return {
    running,
    row: ledgerRow('entry', tx.timestamp, particulars, ref, '', '', running, initials),
  };
}

export function buildPassbook(input: {
  accountId: NidhiAccountId;
  tokenId: LedgerTokenId;
  transactions: FabricTxRecord[];
  /** Opening B/F. Defaults to first signed balanceBefore, else '0'. */
  openingBalance?: string;
  rowsPerPage?: number;
}): Passbook {
  const rowsPerPage = input.rowsPerPage ?? 20;
  const txs = input.transactions
    .filter((t) => t.tokenId === input.tokenId)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp || a.nonce.localeCompare(b.nonce));

  const firstSnap = txs.find(
    (t) => t.from === input.accountId && typeof t.balanceBefore === 'string'
  );
  const opening: string = input.openingBalance ?? firstSnap?.balanceBefore ?? '0';
  let running = opening;

  const entries: PassbookRow[] = [];
  for (const tx of txs) {
    const next = entryFromTx(input.accountId, tx, running);
    running = next.running;
    entries.push(next.row);
  }

  const closingBalance = entries.length ? entries[entries.length - 1]!.balance : opening;
  const pages: PassbookPage[] = [];

  if (entries.length === 0) {
    pages.push({
      pageNumber: 1,
      accountId: input.accountId,
      tokenId: input.tokenId,
      broughtForward: opening,
      carriedForward: opening,
      rows: [ledgerRow('bf', 0, 'B/F', '', '', '', opening)],
    });
    return { accountId: input.accountId, tokenId: input.tokenId, pages, closingBalance: opening };
  }

  const chunkCount = Math.max(1, Math.ceil(entries.length / rowsPerPage));
  for (let i = 0; i < chunkCount; i++) {
    const slice = entries.slice(i * rowsPerPage, (i + 1) * rowsPerPage);
    const broughtForward = i === 0 ? opening : pages[i - 1]!.carriedForward;
    const carriedForward = slice[slice.length - 1]!.balance;
    const ts = slice[0]!.timestamp;
    const rows: PassbookRow[] = [
      ledgerRow('bf', ts, 'B/F', '', '', '', broughtForward),
      ...slice,
    ];
    if (i < chunkCount - 1) {
      rows.push(ledgerRow('cf', slice[slice.length - 1]!.timestamp, 'C/F', '', '', '', carriedForward));
    }
    pages.push({
      pageNumber: i + 1,
      accountId: input.accountId,
      tokenId: input.tokenId,
      rows,
      broughtForward,
      carriedForward,
    });
  }

  return {
    accountId: input.accountId,
    tokenId: input.tokenId,
    pages,
    closingBalance,
  };
}

export async function buildPassbookFromGateway(
  gateway: FabricGateway,
  accountId: NidhiAccountId,
  tokenId: LedgerTokenId,
  rowsPerPage?: number
): Promise<Passbook> {
  const transactions = await gateway.listTransactions(accountId);
  const closing = await gateway.getBalance(accountId, tokenId);
  const tokenTxs = transactions.filter((t) => t.tokenId === tokenId);
  let openingBalance = closing.amount;
  for (const tx of [...tokenTxs].reverse()) {
    if (tx.from === accountId && tx.to !== accountId) {
      openingBalance = addAmount(openingBalance, tx.amount);
    } else if (tx.to === accountId && tx.from !== accountId) {
      openingBalance = subAmountUnchecked(openingBalance, tx.amount);
    }
  }
  return buildPassbook({ accountId, tokenId, transactions, openingBalance, rowsPerPage });
}
