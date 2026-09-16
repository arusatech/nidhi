import { sha256 } from '@noble/hashes/sha2';
import { canonicalJson, toHex, utf8 } from '../crypto/keys';
import type { GeoPoint, PostalAddress } from '../types';

/** SHA-256 hex of canonical JSON (address / geo commitments). */
export function commitmentHex(value: unknown): string {
  return toHex(sha256(utf8(canonicalJson(value))));
}

function omitUndef<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Bank computes this at KYC; stored on IdentityCert, copied onto receipts. */
export function addressCommitment(address: PostalAddress): string {
  return commitmentHex(
    omitUndef({
      legalName: address.legalName,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
    })
  );
}

function roundCoord(n: number): number {
  return Number(n.toFixed(6));
}

export function normalizeGeoPoint(point: GeoPoint): Record<string, unknown> {
  return omitUndef({
    latitude: roundCoord(point.latitude),
    longitude: roundCoord(point.longitude),
    accuracyM: point.accuracyM !== undefined ? roundCoord(point.accuracyM) : undefined,
    timestamp: point.timestamp,
  });
}

/** Buyer pay-time GPS / IP location hash (6 decimal places). */
export function geoCommitment(point: GeoPoint): string {
  return commitmentHex(normalizeGeoPoint(point));
}
