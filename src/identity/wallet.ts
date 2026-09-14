import {
  createEd25519Wallet,
  fromHex,
  toHex,
  walletFromPrivateKey,
} from '../crypto/keys';
import type { IdentityCert, NidhiKeyPair } from '../types';
import {
  decryptVaultPayload,
  encryptVaultPayload,
  type EncryptedVaultBlob,
} from '../vault/encrypt';

export interface WalletExportJson {
  version: 1;
  accountId: string;
  publicKeyHex: string;
  /** Hex private key — only inside encrypted vault. */
  privateKeyHex: string;
  createdAt: number;
}

export function createWallet(): NidhiKeyPair {
  return createEd25519Wallet();
}

export function importWalletFromPrivateKeyHex(privateKeyHex: string): NidhiKeyPair {
  return walletFromPrivateKey(fromHex(privateKeyHex));
}

export function exportWalletJson(wallet: NidhiKeyPair): WalletExportJson {
  return {
    version: 1,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    privateKeyHex: toHex(wallet.privateKey),
    createdAt: Date.now(),
  };
}

export function importWalletJson(json: WalletExportJson): NidhiKeyPair {
  if (json.version !== 1) throw new Error('Unsupported wallet export version');
  const wallet = walletFromPrivateKey(fromHex(json.privateKeyHex));
  if (wallet.publicKeyHex !== json.publicKeyHex) {
    throw new Error('Wallet public key mismatch');
  }
  return wallet;
}

/** Encrypt wallet for GDrive/iCloud `nidhi-wallet.vault`. */
export async function backupEncryptedWallet(
  wallet: NidhiKeyPair,
  passphrase: string
): Promise<EncryptedVaultBlob> {
  const payload = JSON.stringify(exportWalletJson(wallet));
  return encryptVaultPayload(payload, passphrase);
}

export async function restoreEncryptedWallet(
  blob: EncryptedVaultBlob,
  passphrase: string
): Promise<NidhiKeyPair> {
  const raw = await decryptVaultPayload(blob, passphrase);
  const json = JSON.parse(raw) as WalletExportJson;
  return importWalletJson(json);
}

export function makeUnauthenticatedCert(wallet: NidhiKeyPair, ttlMs?: number): IdentityCert {
  const issuedAt = Date.now();
  return {
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    issuedAt,
    expiresAt: ttlMs ? issuedAt + ttlMs : undefined,
  };
}

/** Filename convention inside user `annadataai` folder. */
export const CLOUD_VAULT_FILENAME = 'nidhi-wallet.vault.json';
export const ANNADATA_CLOUD_FOLDER = 'annadataai';
