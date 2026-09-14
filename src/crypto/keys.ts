import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';
import type { NidhiKeyPair } from '../types';

const ACCOUNT_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

export function fromHex(hex: string): Uint8Array {
  return hexToBytes(hex.replace(/^0x/i, ''));
}

/** Derive a short display account id from public key (8 chars, Crockford-ish). */
export function accountIdFromPublicKey(publicKey: Uint8Array): string {
  const digest = sha256(publicKey);
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(digest[i]!);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = ACCOUNT_ALPHABET[Number(n % 32n)] + out;
    n /= 32n;
  }
  return out;
}

export function createEd25519Wallet(): NidhiKeyPair {
  const privateKey = randomBytes(32);
  const publicKey = ed25519.getPublicKey(privateKey);
  const publicKeyHex = toHex(publicKey);
  return {
    privateKey,
    publicKey,
    publicKeyHex,
    accountId: accountIdFromPublicKey(publicKey),
  };
}

export function walletFromPrivateKey(privateKey: Uint8Array): NidhiKeyPair {
  if (privateKey.length !== 32) {
    throw new Error('Ed25519 private key must be 32 bytes');
  }
  const publicKey = ed25519.getPublicKey(privateKey);
  const publicKeyHex = toHex(publicKey);
  return {
    privateKey,
    publicKey,
    publicKeyHex,
    accountId: accountIdFromPublicKey(publicKey),
  };
}

export function signMessage(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verifyMessage(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
