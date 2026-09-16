import { randomBytes } from '@noble/hashes/utils';
import {
  accountIdFromPublicKeyHex,
  canonicalJson,
  fromHex,
  signMessage,
  toHex,
  utf8,
  verifyMessage,
} from '../crypto/keys';
import { geoCommitment } from '../identity/commitments';
import { compareAmount, isPositiveAmount, subAmount } from './amount';
import type {
  AddressCommitments,
  GeoPoint,
  GeoSource,
  LedgerTokenId,
  NidhiAccountId,
  NidhiKeyPair,
  OfflineReceipt,
  SignedTransfer,
  TransferIntent,
  VendorPayQr,
} from '../types';

function newNonce(): string {
  return toHex(randomBytes(16));
}

function omitUndef(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
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
  if (!isPositiveAmount(input.amount)) {
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

function transferSigningPayload(intent: TransferIntent): Uint8Array {
  return utf8(canonicalJson(intent));
}

export function signTransfer(wallet: NidhiKeyPair, intent: TransferIntent): SignedTransfer {
  if (intent.from !== wallet.accountId) {
    throw new Error('Transfer from must match wallet accountId');
  }
  const signature = signMessage(wallet.privateKey, transferSigningPayload(intent));
  return {
    ...intent,
    publicKeyHex: wallet.publicKeyHex,
    signatureHex: toHex(signature),
  };
}

export function verifySignedTransfer(tx: SignedTransfer): boolean {
  if (accountIdFromPublicKeyHex(tx.publicKeyHex) !== tx.from) return false;
  const intent: TransferIntent = {
    from: tx.from,
    to: tx.to,
    amount: tx.amount,
    tokenId: tx.tokenId,
    nonce: tx.nonce,
    timestamp: tx.timestamp,
  };
  return verifyMessage(
    fromHex(tx.publicKeyHex),
    transferSigningPayload(intent),
    fromHex(tx.signatureHex)
  );
}

function receiptSigningBody(receipt: OfflineReceipt): Record<string, unknown> {
  return omitUndef({
    kind: receipt.kind,
    from: receipt.from,
    to: receipt.to,
    amount: receipt.amount,
    tokenId: receipt.tokenId,
    nonce: receipt.nonce,
    timestamp: receipt.timestamp,
    noteId: receipt.noteId,
    particulars: receipt.particulars,
    chequeOrRefNo: receipt.chequeOrRefNo,
    initials: receipt.initials,
    balanceBefore: receipt.balanceBefore,
    balanceAfter: receipt.balanceAfter,
    addressCommitments: receipt.addressCommitments,
    geoSource: receipt.geoSource,
    geoCommitment: receipt.geoCommitment,
  });
}

function signReceiptBody(wallet: NidhiKeyPair, unsigned: OfflineReceipt): OfflineReceipt {
  const signature = signMessage(wallet.privateKey, utf8(canonicalJson(receiptSigningBody(unsigned))));
  return {
    ...unsigned,
    publicKeyHex: wallet.publicKeyHex,
    signatureHex: toHex(signature),
  };
}

/** Offline Digital Receipt — signed passbook row + optional KYC/geo commitments. */
export function createOfflineReceipt(
  wallet: NidhiKeyPair,
  input: {
    to: NidhiAccountId;
    amount: string;
    tokenId: LedgerTokenId;
    /** From gateway.getBalance — required so remaining balance and insufficient-funds are on the receipt. */
    balanceBefore: string;
    noteId?: string;
    particulars?: string;
    chequeOrRefNo?: string;
    initials?: string;
    addressCommitments?: AddressCommitments;
    geo?: { source: GeoSource; point: GeoPoint };
  }
): OfflineReceipt {
  if (!/^\d+(\.\d+)?$/.test(input.balanceBefore) || Number(input.balanceBefore) < 0) {
    throw new Error('balanceBefore must be a non-negative decimal string');
  }
  if (compareAmount(input.balanceBefore, input.amount) < 0) {
    throw new Error('Insufficient funds');
  }
  const intent = createTransferIntent({
    from: wallet.accountId,
    to: input.to,
    amount: input.amount,
    tokenId: input.tokenId,
  });
  const balanceAfter = subAmount(input.balanceBefore, input.amount);
  const unsigned: OfflineReceipt = {
    ...intent,
    publicKeyHex: wallet.publicKeyHex,
    signatureHex: '',
    kind: 'offline_receipt',
    noteId: input.noteId,
    particulars: input.particulars?.trim() || `TO TRANSFER / ${intent.to}`,
    chequeOrRefNo: input.chequeOrRefNo?.trim() || intent.nonce,
    initials: input.initials,
    balanceBefore: input.balanceBefore,
    balanceAfter,
    addressCommitments: input.addressCommitments,
    geoSource: input.geo?.source,
    geoCommitment: input.geo ? geoCommitment(input.geo.point) : undefined,
  };
  return signReceiptBody(wallet, unsigned);
}

export function verifyOfflineReceipt(receipt: OfflineReceipt): boolean {
  if (receipt.kind !== 'offline_receipt') return false;
  if (accountIdFromPublicKeyHex(receipt.publicKeyHex) !== receipt.from) return false;
  try {
    if (subAmount(receipt.balanceBefore, receipt.amount) !== receipt.balanceAfter) return false;
  } catch {
    return false;
  }
  return verifyMessage(
    fromHex(receipt.publicKeyHex),
    utf8(canonicalJson(receiptSigningBody(receipt))),
    fromHex(receipt.signatureHex)
  );
}

/**
 * Compact payload for Return QR (buyer → vendor).
 * Street address and raw lat/lon stay off the QR (commitments only).
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

/** Stall Pay QR: vendor accountId only (optional amount). Address comes from the bank. */
export function encodeVendorPayQr(qr: Omit<VendorPayQr, 'kind'>): string {
  if (!qr.accountId?.trim()) throw new Error('Vendor Pay QR requires accountId');
  const payload: VendorPayQr = {
    kind: 'vendor_pay_qr',
    accountId: qr.accountId.trim(),
    ...(qr.amount !== undefined ? { amount: qr.amount } : {}),
    ...(qr.tokenId !== undefined ? { tokenId: qr.tokenId } : {}),
  };
  return JSON.stringify(payload);
}

export function decodeVendorPayQr(raw: string): VendorPayQr {
  const parsed = JSON.parse(raw) as VendorPayQr;
  if (parsed?.kind !== 'vendor_pay_qr' || !parsed.accountId) {
    throw new Error('Not a vendor Pay QR');
  }
  return parsed;
}
