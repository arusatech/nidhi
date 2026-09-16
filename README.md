# @annadata/nidhi

Local-first Nidhi wallet library for Annadata. Device keys, signed offline receipts, bank-attested KYC hashes, and Hyperledger Fabric settlement. Dual US/IN fiat treasuries for on/off-ramp. **No central user ledger in this package** — balances live on Fabric.

User and operator scenarios: [docs/use-cases.md](docs/use-cases.md).

## Install (from annadata-app)

```bash
cd ref-code/nidhi && npm install && npm run build
```

In the app `package.json`:

```json
"@annadata/nidhi": "file:./ref-code/nidhi"
```

```bash
npm test              # wallet / receipt / passbook
npm run test:chaincode
npm run typecheck
```

## Capabilities (v0.1)

| Area | Status |
|------|--------|
| Ed25519 wallet create / import | Done |
| Offline signed receipt + Return QR / Vendor Pay QR | Done |
| Passbook row on the receipt (date, particulars, ref, Dr, balances) | Done |
| Insufficient funds rejected at receipt create | Done |
| Bank KYC directory: address commitment by `accountId` | Done |
| Buyer GPS / IP geo commitment on the receipt | Done |
| Encrypted cloud vault blob (passphrase AES-GCM) | Done |
| Cloud vault adapter port (wire GDrive/iCloud in app) | Done |
| In-memory Fabric gateway (demo) + HTTP BFF client | Done |
| Real Fabric peers / Go chaincode | Done |
| US / IN corridor detect + on/off-ramp quote helpers | Done |
| Verify bundle from gateway history (lost-phone) | Done |
| Live FX oracle + bank treasury APIs | Next |

## What lives where

| Data | Where | Notes |
|------|--------|--------|
| Private keys | Device (+ encrypted user GDrive/iCloud `annadataai`) | Never sent to Fabric or the bank |
| Balances and txs | Fabric peers (`FabricGateway`) | System of record |
| Postal address | Bank KYC directory | Street lines stay off every QR |
| Pay-time GPS | Hashed into the buyer-signed receipt | Raw lat/lon only in a geo statement |

```text
Vendor Pay QR (accountId only)
        │
        ▼
Buyer app ── lookupCert(from) / lookupCert(to) ──► Bank PartyDirectory
        │                                              (CA-attested address hashes)
        ├── getBalance ──► Fabric
        ├── device GPS or IP geo
        ▼
OfflineReceipt (signed passbook + commitments + geoCommitment)
        │
        ▼
Return QR ── vendor submit ──► Fabric Transfer / SubmitReceipt
```

## Receipt and passbook

`createOfflineReceipt` signs a passbook row. `balanceBefore` must come from `gateway.getBalance`, not a number the UI invents.

| Column | On the receipt |
|--------|----------------|
| Date | `timestamp` (render with `formatPassbookDate`) |
| Particulars | `particulars` |
| Cheque / Ref No. | `chequeOrRefNo` (defaults to `nonce`) |
| Withdrawal (Dr) | `amount` (buyer is always `from`) |
| Deposit (Cr) | Empty on this receipt; vendor passbook shows Cr |
| Balance before / after | `balanceBefore` → `balanceAfter` (`5000 − 22 → 4978`) |
| Initials | optional `initials` |

If `balanceBefore < amount`, create throws `Insufficient funds` and does not sign. Verify also requires `balanceAfter === balanceBefore − amount`. Fabric settlement still rejects a stale snapshot or double-spend.

`buildPassbook` / `buildPassbookFromGateway` paginate with **B/F** and **C/F**. See `PASSBOOK_COLUMNS` and `PASSBOOK_ABBREVIATIONS`.

## Bank address (not on the QR)

Vendor (and buyer / lender / banker) postal address is **looked up from the bank by `accountId`**. A stall Pay QR is only `accountId` (± amount).

1. At KYC the bank hashes `PostalAddress` → `addressCommitment` and CA-signs an `IdentityCert`.
2. At pay time: `directory.lookupCert(vendorAccountId)` — that hash is `vendorCert.addressCommitment`.
3. Copy buyer + vendor hashes onto the receipt so a later KYC change cannot rewrite this payment.
4. When someone asks for a street address: `directory.lookupAddressStatement(accountId, 'vendor')`. Verifiers check the hash against the receipt and the CA signature.

## Buyer GPS

Pass device GPS (`source: 'device'`) after scanning a stall QR, or IP geolocation (`source: 'ip'`) for an online purchase. The library hashes the point (`6` decimal places) into `geoCommitment`. Raw coordinates are not on the Return QR; `createGeoStatement` reveals them on request.

## Quick usage

```ts
import {
  createWallet,
  createOfflineReceipt,
  encodeReturnQrPayload,
  encodeVendorPayQr,
  decodeVendorPayQr,
  backupEncryptedWallet,
  InMemoryFabricGateway,
  MemoryPartyDirectory,
  signTransfer,
  createTransferIntent,
  buildOnRampIntent,
  buildPassbookFromGateway,
} from '@annadata/nidhi';

const buyer = createWallet();
const vendor = createWallet();
const ca = createWallet(); // demo bank CA
const directory = new MemoryPartyDirectory();
directory.enroll(ca, buyer, {
  legalName: 'Buyer',
  line1: '1 Main St',
  city: 'Austin',
  region: 'TX',
  postalCode: '78701',
  country: 'US',
});
directory.enroll(ca, vendor, {
  legalName: 'Tea Stall',
  line1: '9 Stall Lane',
  city: 'Bengaluru',
  region: 'KA',
  postalCode: '560001',
  country: 'IN',
});

const payQr = encodeVendorPayQr({ accountId: vendor.accountId });
const { accountId: vendorAccountId } = decodeVendorPayQr(payQr);

const gw = new InMemoryFabricGateway();
gw.mint(buyer.accountId, 'NIDHI-USD', '5000');
const { amount: balanceBefore } = await gw.getBalance(buyer.accountId, 'NIDHI-USD');

const buyerCert = await directory.lookupCert(buyer.accountId);
const vendorCert = await directory.lookupCert(vendorAccountId);

const receipt = createOfflineReceipt(buyer, {
  to: vendorAccountId,
  amount: '22',
  tokenId: 'NIDHI-USD',
  balanceBefore, // 5000 → receipt.balanceAfter === '4978'
  particulars: 'UPI/12345/Tea Vendor',
  addressCommitments: {
    buyer: buyerCert.addressCommitment,
    vendor: vendorCert.addressCommitment,
  },
  geo: { source: 'device', point: { latitude: 12.9716, longitude: 77.5946, timestamp: Date.now() } },
});
const returnQr = encodeReturnQrPayload(receipt);

await gw.submitOfflineReceipt(receipt);
await buildPassbookFromGateway(gw, buyer.accountId, 'NIDHI-USD');

const vault = await backupEncryptedWallet(buyer, 'user-passphrase');
// app writes vault JSON to user GDrive/iCloud folder annadataai

await gw.submitTransfer(
  signTransfer(
    buyer,
    createTransferIntent({
      from: buyer.accountId,
      to: vendor.accountId,
      amount: '10',
      tokenId: 'NIDHI-USD',
    })
  )
);

buildOnRampIntent({ corridor: 'US', fiatAmount: '100' }); // → NIDHI-USD via USA treasury
buildOnRampIntent({ corridor: 'IN', fiatAmount: '1000' }); // → NIDHI-INR via India treasury
```

Production apps use `HttpPartyDirectory` and `HttpFabricGateway` against the Annadata BFF instead of the in-memory adapters.

## Fabric chaincode (peers)

Go contract in `chaincode/nidhi`: `Mint` (ramp MSPs), `Transfer`, `SubmitReceipt`, `GetBalance`, `ListTransactions`. Peers verify the same Ed25519 payloads the wallet signs; they never hold user private keys. `from` must match the account id derived from the signer public key.

Deploy onto [fabric-samples test-network](https://github.com/hyperledger/fabric-samples):

```bash
export FABRIC_SAMPLES=~/fabric-samples
bash network/deploy-test-network.sh
```

The mobile app keeps using `HttpFabricGateway` (BFF). The BFF uses `connectPeerFabricGateway` from `@annadata/nidhi/peer`:

```bash
npm i @hyperledger/fabric-gateway @grpc/grpc-js   # BFF only, not the Ionic app
```

```ts
import { connectPeerFabricGateway } from '@annadata/nidhi/peer';
```

Ramp mint is allowed for `Org1MSP`, `RampUSMSP`, `RampINMSP`, and `AnnadataTrustMSP`.

## Design notes

- **No central user ledger in this library** — balances live behind `FabricGateway`.
- **Keys** stay on device; cloud holds **encrypted** `nidhi-wallet.vault.json` only.
- **annadata.ai USA + India bank accounts** are ramp float (see `TREASURY_LABELS`), not the Fabric world state.
- Return QR carries passbook fields, balance snapshots, address **hashes**, and `geoCommitment` — not street address and not raw GPS.
