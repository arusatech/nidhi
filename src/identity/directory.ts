import { issueAttestedCert } from './cert';
import { createAddressStatement } from './statements';
import type {
  AddressStatement,
  IdentityCert,
  NidhiAccountId,
  NidhiKeyPair,
  PartyRole,
  PostalAddress,
} from '../types';

export interface PartyDirectory {
  lookupCert(accountId: NidhiAccountId): Promise<IdentityCert>;
  lookupAddressStatement(accountId: NidhiAccountId, partyRole: PartyRole): Promise<AddressStatement>;
}

type DirectoryRow = { cert: IdentityCert; address: PostalAddress };

/**
 * In-memory bank KYC directory for tests / demos.
 * Production: HttpPartyDirectory against the Annadata BFF.
 */
export class MemoryPartyDirectory implements PartyDirectory {
  private rows = new Map<NidhiAccountId, DirectoryRow>();

  /** Bank onboarding: CA-attest subject address and store by accountId. */
  enroll(
    ca: NidhiKeyPair,
    subject: Pick<NidhiKeyPair, 'accountId' | 'publicKeyHex'>,
    address: PostalAddress,
    ttlMs?: number
  ): IdentityCert {
    const cert = issueAttestedCert(ca, subject, address, ttlMs);
    this.rows.set(subject.accountId, { cert, address });
    return cert;
  }

  async lookupCert(accountId: NidhiAccountId): Promise<IdentityCert> {
    const row = this.rows.get(accountId);
    if (!row) throw new Error(`Unknown account ${accountId}`);
    return row.cert;
  }

  async lookupAddressStatement(
    accountId: NidhiAccountId,
    partyRole: PartyRole
  ): Promise<AddressStatement> {
    const row = this.rows.get(accountId);
    if (!row) throw new Error(`Unknown account ${accountId}`);
    return createAddressStatement({ cert: row.cert, address: row.address, partyRole });
  }
}

/** HTTP bank directory (Annadata BFF). */
export class HttpPartyDirectory implements PartyDirectory {
  constructor(private readonly baseUrl: string, private readonly fetchFn: typeof fetch = fetch) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async lookupCert(accountId: NidhiAccountId): Promise<IdentityCert> {
    const res = await this.fetchFn(
      this.url(`/bank/cert?accountId=${encodeURIComponent(accountId)}`)
    );
    if (!res.ok) throw new Error(`cert http_${res.status}`);
    return (await res.json()) as IdentityCert;
  }

  async lookupAddressStatement(
    accountId: NidhiAccountId,
    partyRole: PartyRole
  ): Promise<AddressStatement> {
    const res = await this.fetchFn(
      this.url(
        `/bank/address-statement?accountId=${encodeURIComponent(accountId)}&partyRole=${encodeURIComponent(partyRole)}`
      )
    );
    if (!res.ok) throw new Error(`address-statement http_${res.status}`);
    return (await res.json()) as AddressStatement;
  }
}
