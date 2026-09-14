/**
 * @annadata/nidhi — local-first Nidhi wallet library.
 *
 * - Device Ed25519 keys + offline signed receipts (Return QR)
 * - Encrypted cloud vault helpers (user GDrive/iCloud `annadataai`)
 * - Fabric gateway port (in-memory demo + HTTP BFF client)
 * - US / India corridor ramp quotes (annadata.ai dual treasury)
 */

export type {
  Corridor,
  FiatCurrency,
  FxQuote,
  IdentityCert,
  LedgerTokenId,
  NidhiAccountId,
  NidhiKeyPair,
  OfflineReceipt,
  RampIntent,
  SignedTransfer,
  TransferIntent,
} from './types';

export {
  accountIdFromPublicKey,
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
  encodeReturnQrPayload,
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

export { buildVerifyBundle, verifyBundleLocally } from './verify/bundle';
export type { VerifyBundle } from './verify/bundle';
