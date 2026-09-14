/** Shared Nidhi domain types. */

export type Corridor = 'US' | 'IN';

export type LedgerTokenId = 'NIDHI-USD' | 'NIDHI-INR';

export type NidhiAccountId = string;

export interface NidhiKeyPair {
  /** Raw 32-byte private key (keep in enclave / vault only). */
  privateKey: Uint8Array;
  /** Compressed or raw public key bytes. */
  publicKey: Uint8Array;
  /** Hex-encoded public key used as DID / account handle. */
  publicKeyHex: string;
  /** Short account id derived from pubkey (display / QR). */
  accountId: NidhiAccountId;
}

export interface IdentityCert {
  accountId: NidhiAccountId;
  publicKeyHex: string;
  /** Bank/CA signature over cert body (hex). Optional until attested tier. */
  caSignatureHex?: string;
  issuedAt: number;
  expiresAt?: number;
}

export interface TransferIntent {
  from: NidhiAccountId;
  to: NidhiAccountId;
  amount: string;
  tokenId: LedgerTokenId;
  nonce: string;
  timestamp: number;
}

export interface SignedTransfer extends TransferIntent {
  publicKeyHex: string;
  signatureHex: string;
}

export interface OfflineReceipt extends SignedTransfer {
  kind: 'offline_receipt';
  /** Optional spend-note id when using instrument model. */
  noteId?: string;
}

export type FiatCurrency = 'USD' | 'INR';

export interface FxQuote {
  corridor: Corridor;
  from: FiatCurrency | LedgerTokenId;
  to: FiatCurrency | LedgerTokenId;
  rate: string;
  amountIn: string;
  amountOut: string;
  quotedAt: number;
  expiresAt: number;
}

export interface RampIntent {
  corridor: Corridor;
  direction: 'onramp' | 'offramp';
  fiatCurrency: FiatCurrency;
  tokenId: LedgerTokenId;
  fiatAmount: string;
  tokenAmount: string;
  quote: FxQuote;
}
