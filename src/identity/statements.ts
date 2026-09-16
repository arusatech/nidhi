import { addressCommitment, geoCommitment } from './commitments';
import { verifyIdentityCert } from './cert';
import type {
  AddressStatement,
  GeoStatement,
  IdentityCert,
  OfflineReceipt,
  PartyRole,
  PostalAddress,
} from '../types';

export function createAddressStatement(input: {
  cert: IdentityCert;
  address: PostalAddress;
  partyRole: PartyRole;
}): AddressStatement {
  if (!input.cert.addressCommitment) {
    throw new Error('Cert is not address-attested');
  }
  if (addressCommitment(input.address) !== input.cert.addressCommitment) {
    throw new Error('Address does not match cert commitment');
  }
  return {
    kind: 'address_statement',
    partyRole: input.partyRole,
    accountId: input.cert.accountId,
    address: input.address,
    cert: input.cert,
  };
}

export function verifyAddressStatement(
  statement: AddressStatement,
  opts: { trustedCaPublicKeyHex: string; expectedCommitment?: string }
): boolean {
  if (statement.kind !== 'address_statement') return false;
  if (statement.accountId !== statement.cert.accountId) return false;
  if (!verifyIdentityCert(statement.cert, opts.trustedCaPublicKeyHex)) return false;
  if (addressCommitment(statement.address) !== statement.cert.addressCommitment) return false;
  if (opts.expectedCommitment && statement.cert.addressCommitment !== opts.expectedCommitment) {
    return false;
  }
  return true;
}

export function createGeoStatement(
  receipt: OfflineReceipt,
  point: Parameters<typeof geoCommitment>[0]
): GeoStatement {
  if (!receipt.geoCommitment || !receipt.geoSource) {
    throw new Error('Receipt has no geo commitment');
  }
  const hashed = geoCommitment(point);
  if (hashed !== receipt.geoCommitment) {
    throw new Error('Geo point does not match receipt commitment');
  }
  return {
    kind: 'geo_statement',
    receiptNonce: receipt.nonce,
    source: receipt.geoSource,
    point,
    geoCommitment: hashed,
  };
}

export function verifyGeoStatement(
  statement: GeoStatement,
  opts?: { expectedCommitment?: string; receiptNonce?: string }
): boolean {
  if (statement.kind !== 'geo_statement') return false;
  if (geoCommitment(statement.point) !== statement.geoCommitment) return false;
  if (opts?.expectedCommitment && statement.geoCommitment !== opts.expectedCommitment) return false;
  if (opts?.receiptNonce && statement.receiptNonce !== opts.receiptNonce) return false;
  return true;
}
