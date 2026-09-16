/**
 * @annadata/nidhi — local-first Nidhi wallet library.
 *
 * - Device Ed25519 keys + offline signed receipts (Return QR)
 * - Encrypted cloud vault helpers (user GDrive/iCloud `annadataai`)
 * - Fabric gateway port (in-memory demo + HTTP BFF + peer chaincode adapter)

 * - US / India corridor ramp quotes (annadata.ai dual treasury)
 */

export type {
  AddressCommitments,
  AddressStatement,
  Corridor,
  FiatCurrency,
  FxQuote,
  GeoPoint,
  GeoSource,
  GeoStatement,
  IdentityCert,
  LedgerTokenId,
  NidhiAccountId,
  NidhiKeyPair,
  OfflineReceipt,
  PartyRole,
  PostalAddress,
  RampIntent,
  SignedTransfer,
  TransferIntent,
  VendorPayQr,
} from './types';

export {
  accountIdFromPublicKey,
  accountIdFromPublicKeyHex,
  canonicalJson,
  createEd25519Wallet,
  fromHex,
  toHex,
  verifyMessage,
  walletFromPrivateKey,
} from './crypto/keys';

export {
  ANNADATA_CLOUD_FOLDER,
  CLOUD_VAULT_FILENAME,
  backupEncryptedWallet,
  createWallet,
  exportWalletJson,
  importWalletFromPrivateKeyHex,
  importWalletJson,
  makeUnauthenticatedCert,
  restoreEncryptedWallet,
} from './identity/wallet';

export type { WalletExportJson } from './identity/wallet';

export {
  createOfflineReceipt,
  createTransferIntent,
  decodeReturnQrPayload,
  decodeVendorPayQr,
  encodeReturnQrPayload,
  encodeVendorPayQr,
  signTransfer,
  verifyOfflineReceipt,
  verifySignedTransfer,
} from './pay/transfer';

export {
  decryptVaultPayload,
  encryptVaultPayload,
  passphraseHint,
} from './vault/encrypt';
export type { EncryptedVaultBlob } from './vault/encrypt';

export {
  MemoryCloudVaultAdapter,
  readEncryptedVaultFromCloud,
  writeEncryptedVaultToCloud,
} from './vault/cloudVault';
export type { CloudVaultAdapter } from './vault/cloudVault';

export {
  HttpFabricGateway,
  InMemoryFabricGateway,
} from './fabric/gateway';
export type {
  FabricBalance,
  FabricGateway,
  FabricSubmitResult,
  FabricTxRecord,
} from './fabric/gateway';

export { PeerFabricGateway } from './fabric/peerGateway';
export type { FabricContract, FabricRampGateway } from './fabric/peerGateway';

export {
  TREASURY_LABELS,
  buildOffRampIntent,
  buildOnRampIntent,
  detectCorridor,
  fiatForCorridor,
  quoteFx,
  tokenForCorridor,
} from './bridge/corridors';

export { MemoryOfflineReceiptStore } from './local/receiptStore';
export type { OfflineReceiptStore } from './local/receiptStore';

export { addressCommitment, commitmentHex, geoCommitment } from './identity/commitments';

export { certSigningBody, issueAttestedCert, verifyIdentityCert } from './identity/cert';

export {
  createAddressStatement,
  createGeoStatement,
  verifyAddressStatement,
  verifyGeoStatement,
} from './identity/statements';

export { HttpPartyDirectory, MemoryPartyDirectory } from './identity/directory';
export type { PartyDirectory } from './identity/directory';

export {
  PASSBOOK_ABBREVIATIONS,
  PASSBOOK_COLUMNS,
  buildPassbook,
  buildPassbookFromGateway,
  formatPassbookAmount,
  formatPassbookDate,
} from './passbook/passbook';
export type { Passbook, PassbookPage, PassbookRow, PassbookRowKind } from './passbook/passbook';

export { buildVerifyBundle, verifyBundleLocally } from './verify/bundle';
export type { VerifyBundle } from './verify/bundle';
