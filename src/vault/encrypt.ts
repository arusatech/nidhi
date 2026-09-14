/**
 * Passphrase-based AES-GCM vault encryption (Web Crypto).
 * Used for GDrive / iCloud nidhi-wallet.vault blobs — never store plaintext keys.
 */

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';

export interface EncryptedVaultBlob {
  v: 1;
  kdf: 'pbkdf2-sha256';
  iter: number;
  saltHex: string;
  ivHex: string;
  ciphertextHex: string;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto SubtleCrypto is required for vault encryption');
  }
  return subtle;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const base = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt UTF-8 JSON (or any string) for cloud vault storage. */
export async function encryptVaultPayload(
  plaintext: string,
  passphrase: string,
  iterations = 210_000
): Promise<EncryptedVaultBlob> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(passphrase, salt, iterations);
  const cipherBuf = await getSubtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    v: 1,
    kdf: 'pbkdf2-sha256',
    iter: iterations,
    saltHex: bytesToHex(salt),
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(new Uint8Array(cipherBuf)),
  };
}

export async function decryptVaultPayload(
  blob: EncryptedVaultBlob,
  passphrase: string
): Promise<string> {
  if (blob.v !== 1) throw new Error(`Unsupported vault version ${blob.v}`);
  const salt = hexToBytes(blob.saltHex);
  const iv = hexToBytes(blob.ivHex);
  const ciphertext = hexToBytes(blob.ciphertextHex);
  const key = await deriveAesKey(passphrase, salt, blob.iter);
  const plainBuf = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return new TextDecoder().decode(plainBuf);
}

/** Fingerprint passphrase without storing it (optional UX check). */
export function passphraseHint(passphrase: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(passphrase))).slice(0, 8);
}
