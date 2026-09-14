import type { OfflineReceipt } from '../types';

/** Vendor offline receipt queue (IndexedDB adapter plugged by app later). */
export interface OfflineReceiptStore {
  save(receipt: OfflineReceipt): Promise<void>;
  list(): Promise<OfflineReceipt[]>;
  remove(nonce: string): Promise<void>;
}

export class MemoryOfflineReceiptStore implements OfflineReceiptStore {
  private items: OfflineReceipt[] = [];

  async save(receipt: OfflineReceipt): Promise<void> {
    this.items = this.items.filter((r) => r.nonce !== receipt.nonce);
    this.items.push(receipt);
  }

  async list(): Promise<OfflineReceipt[]> {
    return [...this.items];
  }

  async remove(nonce: string): Promise<void> {
    this.items = this.items.filter((r) => r.nonce !== nonce);
  }
}
