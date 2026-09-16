/** Shared Nidhi domain types. */

export type Corridor = 'US' | 'IN';

export type LedgerTokenId = 'NIDHI-USD' | 'NIDHI-INR';

export type NidhiAccountId = string;

export type PartyRole = 'user' | 'buyer' | 'vendor' | 'lender' | 'banker';

export type GeoSource = 'device' | 'ip';

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

/** KYC postal address. Bank hashes this; street lines stay off QRs. */
export interface PostalAddress {
  legalName: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

/** Buyer pay-time location (device GPS or IP geolocation). */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracyM?: number;
  timestamp: number;
}

/** SHA-256 hex of a party's CA-attested postal address, keyed by role. */
export type AddressCommitments = Partial<Record<PartyRole, string>>;

export interface IdentityCert {
  accountId: NidhiAccountId;
  publicKeyHex: string;
  /** SHA-256 of canonical PostalAddress. Set on attested (KYC) certs. */
  addressCommitment?: string;
  /** Bank/CA public key that signed this cert (hex). */
  caPublicKeyHex?: string;
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
  particulars: string;
  chequeOrRefNo: string;
  initials?: string;
  /** Buyer ledger snapshot from gateway.getBalance at create time. */
  balanceBefore: string;
  /** Signed remaining buyer balance: balanceBefore − amount. */
  balanceAfter: string;
  addressCommitments?: AddressCommitments;
  geoSource?: GeoSource;
  geoCommitment?: string;
}

export interface AddressStatement {
  kind: 'address_statement';
  partyRole: PartyRole;
  accountId: NidhiAccountId;
  address: PostalAddress;
  cert: IdentityCert;
}

export interface GeoStatement {
  kind: 'geo_statement';
  receiptNonce: string;
  source: GeoSource;
  point: GeoPoint;
  geoCommitment: string;
}

export interface VendorPayQr {
  kind: 'vendor_pay_qr';
  accountId: NidhiAccountId;
  amount?: string;
  tokenId?: LedgerTokenId;
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
