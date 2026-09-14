import { randomBytes } from '@noble/hashes/utils';
import {
  canonicalJson,
  fromHex,
  signMessage,
  toHex,
  utf8,
  verifyMessage,
} from '../crypto/keys';
import type {
  LedgerTokenId,
  NidhiAccountId,
  NidhiKeyPair,
  OfflineReceipt,
  SignedTransfer,
  TransferIntent,
} from '../types';

function newNonce(): string {
  return toHex(randomBytes(16));
}

export function createTransferIntent(input: {
  from: NidhiAccountId;
  to: NidhiAccountId;
  amount: string;
  tokenId: LedgerTokenId;
  nonce?: string;
  timestamp?: number;
}): TransferIntent {
  if (!input.to?.trim()) throw new Error('Transfer requires vendor/to account id');
  if (!/^\d+(\.\d+)?$/.test(input.amount) || Number(input.amount) <= 0) {
    throw new Error('Transfer amount must be a positive decimal string');
  }
  return {
    from: input.from,
    to: input.to.trim(),
    amount: input.amount,
    tokenId: input.tokenId,
    nonce: input.nonce ?? newNonce(),
    timestamp: input.timestamp ?? Date.now(),
  };
}

function signingPayload(intent: TransferIntent): Uint8Array {
  // Exclude signature fields; stable key order via canonicalJson.
  return utf8(canonicalJson(intent));
}

export function signTransfer(wallet: NidhiKeyPair, intent: TransferIntent): SignedTransfer {
  if (intent.from !== wallet.accountId) {
    throw new Error('Transfer from must match wallet accountId');
  }
  const signature = signMessage(wallet.privateKey, signingPayload(intent));
  return {
    ...intent,
    publicKeyHex: wallet.publicKeyHex,
    signatureHex: toHex(signature),
  };
}

export function verifySignedTransfer(tx: SignedTransfer): boolean {
  const intent: TransferIntent = {
    from: tx.from,
    to: tx.to,
    amount: tx.amount,
    tokenId: tx.tokenId,
    nonce: tx.nonce,
    timestamp: tx.timestamp,
  };
  return verifyMessage(fromHex(tx.publicKeyHex), signingPayload(intent), fromHex(tx.signatureHex));
}

/** Offline Digital Receipt — same as signed transfer with kind tag for vendor queue. */
export function createOfflineReceipt(
  wallet: NidhiKeyPair,
  input: {
    to: NidhiAccountId;
    amount: string;
    tokenId: LedgerTokenId;
    noteId?: string;
  }
): OfflineReceipt {
  const intent = createTransferIntent({
    from: wallet.accountId,
    to: input.to,
    amount: input.amount,
    tokenId: input.tokenId,
  });
  const signed = signTransfer(wallet, intent);
  return {
    ...signed,
    kind: 'offline_receipt',
    noteId: input.noteId,
  };
}

export function verifyOfflineReceipt(receipt: OfflineReceipt): boolean {
  if (receipt.kind !== 'offline_receipt') return false;
  return verifySignedTransfer(receipt);
}

/**
 * Compact payload for Return QR (buyer → vendor).
 * Keep small; chunk later if needed.
 */
export function encodeReturnQrPayload(receipt: OfflineReceipt): string {
  return JSON.stringify(receipt);
}

export function decodeReturnQrPayload(raw: string): OfflineReceipt {
  const parsed = JSON.parse(raw) as OfflineReceipt;
  if (parsed?.kind !== 'offline_receipt') {
    throw new Error('Not an offline Nidhi receipt QR');
  }
  if (!verifyOfflineReceipt(parsed)) {
    throw new Error('Invalid offline receipt signature');
  }
  return parsed;
}
