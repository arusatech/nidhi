/**
 * Fabric Gateway client interface.
 * Production: HTTPS BFF → Fabric Gateway SDK.
 * Tests / offline demos: InMemoryFabricGateway.
 */

import type {
  AddressCommitments,
  GeoSource,
  LedgerTokenId,
  NidhiAccountId,
  OfflineReceipt,
  SignedTransfer,
} from '../types';
import { addAmount, subAmount } from '../pay/amount';
import { verifyOfflineReceipt, verifySignedTransfer } from '../pay/transfer';

export interface FabricSubmitResult {
  txId: string;
  status: 'committed' | 'pending' | 'rejected';
  reason?: string;
}

export interface FabricBalance {
  accountId: NidhiAccountId;
  tokenId: LedgerTokenId;
  amount: string;
}

export interface FabricTxRecord {
  txId: string;
  from: NidhiAccountId;
  to: NidhiAccountId;
  amount: string;
  tokenId: LedgerTokenId;
  timestamp: number;
  nonce: string;
  particulars?: string;
  chequeOrRefNo?: string;
  initials?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  addressCommitments?: AddressCommitments;
  geoSource?: GeoSource;
  geoCommitment?: string;
}

export interface FabricGateway {
  submitTransfer(tx: SignedTransfer): Promise<FabricSubmitResult>;
  submitOfflineReceipt(receipt: OfflineReceipt): Promise<FabricSubmitResult>;
  getBalance(accountId: NidhiAccountId, tokenId: LedgerTokenId): Promise<FabricBalance>;
  listTransactions(accountId: NidhiAccountId): Promise<FabricTxRecord[]>;
}

type BalKey = `${NidhiAccountId}:${LedgerTokenId}`;

function balKey(accountId: NidhiAccountId, tokenId: LedgerTokenId): BalKey {
  return `${accountId}:${tokenId}`;
}

function isOfflineReceipt(tx: SignedTransfer): tx is OfflineReceipt {
  return (tx as OfflineReceipt).kind === 'offline_receipt';
}

/**
 * Local demo ledger — NOT for production.
 * Mimics Fabric commit for unit tests and stall demos without peers.
 */
export class InMemoryFabricGateway implements FabricGateway {
  private balances = new Map<BalKey, string>();
  private txs: FabricTxRecord[] = [];
  private seenNonces = new Set<string>();

  /** Seed an account for demos (simulates ramp mint). */
  mint(accountId: NidhiAccountId, tokenId: LedgerTokenId, amount: string): void {
    const k = balKey(accountId, tokenId);
    const cur = this.balances.get(k) ?? '0';
    this.balances.set(k, addAmount(cur, amount));
  }

  async submitTransfer(tx: SignedTransfer): Promise<FabricSubmitResult> {
    if (!verifySignedTransfer(tx)) {
      return { txId: '', status: 'rejected', reason: 'invalid_signature' };
    }
    return this.commit(tx);
  }

  async submitOfflineReceipt(receipt: OfflineReceipt): Promise<FabricSubmitResult> {
    if (!verifyOfflineReceipt(receipt)) {
      return { txId: '', status: 'rejected', reason: 'invalid_receipt' };
    }
    return this.commit(receipt);
  }

  private commit(tx: SignedTransfer): FabricSubmitResult {
    const nonceKey = `${tx.from}:${tx.nonce}`;
    if (this.seenNonces.has(nonceKey)) {
      return { txId: '', status: 'rejected', reason: 'replay_nonce' };
    }
    try {
      const fromK = balKey(tx.from, tx.tokenId);
      const toK = balKey(tx.to, tx.tokenId);
      const fromBal = this.balances.get(fromK) ?? '0';
      this.balances.set(fromK, subAmount(fromBal, tx.amount));
      const toBal = this.balances.get(toK) ?? '0';
      this.balances.set(toK, addAmount(toBal, tx.amount));
      this.seenNonces.add(nonceKey);
      const txId = `mem_${tx.nonce}`;
      this.txs.push({
        txId,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        tokenId: tx.tokenId,
        timestamp: tx.timestamp,
        nonce: tx.nonce,
        ...(isOfflineReceipt(tx)
          ? {
              particulars: tx.particulars,
              chequeOrRefNo: tx.chequeOrRefNo,
              initials: tx.initials,
              balanceBefore: tx.balanceBefore,
              balanceAfter: tx.balanceAfter,
              addressCommitments: tx.addressCommitments,
              geoSource: tx.geoSource,
              geoCommitment: tx.geoCommitment,
            }
          : {}),
      });
      return { txId, status: 'committed' };
    } catch (e) {
      return {
        txId: '',
        status: 'rejected',
        reason: e instanceof Error ? e.message : 'commit_failed',
      };
    }
  }

  async getBalance(accountId: NidhiAccountId, tokenId: LedgerTokenId): Promise<FabricBalance> {
    return {
      accountId,
      tokenId,
      amount: this.balances.get(balKey(accountId, tokenId)) ?? '0',
    };
  }

  async listTransactions(accountId: NidhiAccountId): Promise<FabricTxRecord[]> {
    return this.txs.filter((t) => t.from === accountId || t.to === accountId);
  }
}

/**
 * HTTP Fabric gateway client (Annadata BFF).
 * BFF must only forward user-signed intents — never custody private keys.
 */
export class HttpFabricGateway implements FabricGateway {
  constructor(private readonly baseUrl: string, private readonly fetchFn: typeof fetch = fetch) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async submitTransfer(tx: SignedTransfer): Promise<FabricSubmitResult> {
    const res = await this.fetchFn(this.url('/fabric/transfer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    });
    if (!res.ok) {
      return { txId: '', status: 'rejected', reason: `http_${res.status}` };
    }
    return (await res.json()) as FabricSubmitResult;
  }

  async submitOfflineReceipt(receipt: OfflineReceipt): Promise<FabricSubmitResult> {
    const res = await this.fetchFn(this.url('/fabric/receipt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receipt),
    });
    if (!res.ok) {
      return { txId: '', status: 'rejected', reason: `http_${res.status}` };
    }
    return (await res.json()) as FabricSubmitResult;
  }

  async getBalance(accountId: NidhiAccountId, tokenId: LedgerTokenId): Promise<FabricBalance> {
    const res = await this.fetchFn(
      this.url(`/fabric/balance?accountId=${encodeURIComponent(accountId)}&tokenId=${tokenId}`)
    );
    if (!res.ok) throw new Error(`balance http_${res.status}`);
    return (await res.json()) as FabricBalance;
  }

  async listTransactions(accountId: NidhiAccountId): Promise<FabricTxRecord[]> {
    const res = await this.fetchFn(
      this.url(`/fabric/transactions?accountId=${encodeURIComponent(accountId)}`)
    );
    if (!res.ok) throw new Error(`transactions http_${res.status}`);
    return (await res.json()) as FabricTxRecord[];
  }

  async mint(
    accountId: NidhiAccountId,
    tokenId: LedgerTokenId,
    amount: string
  ): Promise<FabricSubmitResult> {
    const res = await this.fetchFn(this.url('/fabric/mint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, tokenId, amount }),
    });
    if (!res.ok) {
      return { txId: '', status: 'rejected', reason: `http_${res.status}` };
    }
    return (await res.json()) as FabricSubmitResult;
  }
}
