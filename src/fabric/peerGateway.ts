/**
 * Fabric Gateway client talking to Nidhi chaincode on real peers.
 * The Ionic/PWA app should keep using HttpFabricGateway (BFF).
 * The BFF constructs a FabricContract from @hyperledger/fabric-gateway.
 */

import type { LedgerTokenId, NidhiAccountId, OfflineReceipt, SignedTransfer } from '../types';
import type {
  FabricBalance,
  FabricGateway,
  FabricSubmitResult,
  FabricTxRecord,
} from './gateway';

export interface FabricRampGateway extends FabricGateway {
  mint(accountId: NidhiAccountId, tokenId: LedgerTokenId, amount: string): Promise<FabricSubmitResult>;
}

/** Subset of @hyperledger/fabric-gateway Contract used by the BFF. */
export interface FabricContract {
  submitTransaction(name: string, ...args: string[]): Promise<Uint8Array>;
  evaluateTransaction(name: string, ...args: string[]): Promise<Uint8Array>;
}

const utf8 = new TextDecoder();

function decodeJson<T>(bytes: Uint8Array): T {
  const text = utf8.decode(bytes);
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Adapter over Nidhi chaincode (`Transfer`, `SubmitReceipt`, `Mint`, `GetBalance`, `ListTransactions`).
 */
export class PeerFabricGateway implements FabricRampGateway {
  constructor(private readonly contract: FabricContract) {}

  async submitTransfer(tx: SignedTransfer): Promise<FabricSubmitResult> {
    return this.submit('Transfer', JSON.stringify(tx));
  }

  async submitOfflineReceipt(receipt: OfflineReceipt): Promise<FabricSubmitResult> {
    return this.submit('SubmitReceipt', JSON.stringify(receipt));
  }

  async mint(
    accountId: NidhiAccountId,
    tokenId: LedgerTokenId,
    amount: string
  ): Promise<FabricSubmitResult> {
    return this.submit('Mint', accountId, tokenId, amount);
  }

  async getBalance(accountId: NidhiAccountId, tokenId: LedgerTokenId): Promise<FabricBalance> {
    const raw = await this.contract.evaluateTransaction('GetBalance', accountId, tokenId);
    return decodeJson<FabricBalance>(raw);
  }

  async listTransactions(accountId: NidhiAccountId): Promise<FabricTxRecord[]> {
    const raw = await this.contract.evaluateTransaction('ListTransactions', accountId);
    const parsed = decodeJson<FabricTxRecord[] | { result?: FabricTxRecord[] }>(raw);
    return Array.isArray(parsed) ? parsed : parsed.result ?? [];
  }

  private async submit(name: string, ...args: string[]): Promise<FabricSubmitResult> {
    try {
      const raw = await this.contract.submitTransaction(name, ...args);
      const parsed = decodeJson<FabricSubmitResult>(raw);
      if (parsed.status) return parsed;
      return { txId: utf8.decode(raw) || parsed.txId || '', status: 'committed' };
    } catch (e) {
      return {
        txId: '',
        status: 'rejected',
        reason: e instanceof Error ? e.message : 'peer_submit_failed',
      };
    }
  }
}
