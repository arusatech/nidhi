import type { FabricGateway, FabricTxRecord } from '../fabric/gateway';
import type { IdentityCert, NidhiAccountId } from '../types';

export interface VerifyBundle {
  accountId: NidhiAccountId;
  cert?: IdentityCert;
  transactions: FabricTxRecord[];
  builtAt: number;
}

/** Pull authority history from Fabric for lost-phone restore / bank verify. */
export async function buildVerifyBundle(
  gateway: FabricGateway,
  accountId: NidhiAccountId,
  cert?: IdentityCert
): Promise<VerifyBundle> {
  const transactions = await gateway.listTransactions(accountId);
  return {
    accountId,
    cert,
    transactions,
    builtAt: Date.now(),
  };
}

/**
 * Stateless structural checks (bank/CA still verifies signatures on peers).
 * Ensures bundle is self-consistent for the claimed account.
 */
export function verifyBundleLocally(bundle: VerifyBundle): boolean {
  if (!bundle.accountId) return false;
  if (bundle.cert && bundle.cert.accountId !== bundle.accountId) return false;
  return bundle.transactions.every(
    (t) => t.from === bundle.accountId || t.to === bundle.accountId
  );
}
