import {
  canonicalJson,
  fromHex,
  signMessage,
  toHex,
  utf8,
  verifyMessage,
} from '../crypto/keys';
import { addressCommitment } from './commitments';
import type { IdentityCert, NidhiKeyPair, PostalAddress } from '../types';

function omitUndef(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Body the CA signs — no street address, no signature field. */
export function certSigningBody(cert: IdentityCert): Record<string, unknown> {
  return omitUndef({
    accountId: cert.accountId,
    publicKeyHex: cert.publicKeyHex,
    addressCommitment: cert.addressCommitment,
    caPublicKeyHex: cert.caPublicKeyHex,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
  });
}

export function issueAttestedCert(
  ca: NidhiKeyPair,
  subject: { accountId: string; publicKeyHex: string },
  address: PostalAddress,
  ttlMs?: number
): IdentityCert {
  const issuedAt = Date.now();
  const unsigned: IdentityCert = {
    accountId: subject.accountId,
    publicKeyHex: subject.publicKeyHex,
    addressCommitment: addressCommitment(address),
    caPublicKeyHex: ca.publicKeyHex,
    issuedAt,
    expiresAt: ttlMs ? issuedAt + ttlMs : undefined,
  };
  const signature = signMessage(ca.privateKey, utf8(canonicalJson(certSigningBody(unsigned))));
  return { ...unsigned, caSignatureHex: toHex(signature) };
}

export function verifyIdentityCert(cert: IdentityCert, trustedCaPublicKeyHex: string): boolean {
  if (!cert.addressCommitment || !cert.caPublicKeyHex || !cert.caSignatureHex) return false;
  if (cert.caPublicKeyHex !== trustedCaPublicKeyHex) return false;
  if (cert.expiresAt !== undefined && cert.expiresAt < Date.now()) return false;
  return verifyMessage(
    fromHex(cert.caPublicKeyHex),
    utf8(canonicalJson(certSigningBody(cert))),
    fromHex(cert.caSignatureHex)
  );
}
