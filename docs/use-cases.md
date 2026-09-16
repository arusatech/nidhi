# Nidhi use cases

User and operator scenarios built on `@annadata/nidhi`. This package is a **library**, not a finished consumer app — the Ionic/Annadata app wires these flows to UI, GPS, Drive/iCloud, and the BFF.

**Legend:** Done = APIs exist in this repo · Partial = helpers only (no live bank/oracle yet) · Next = planned.

---

## Actors

| Actor | Role |
|-------|------|
| **Buyer / user** | Holds a device wallet; spends `NIDHI-USD` or `NIDHI-INR` |
| **Vendor / stall** | Shows a Pay QR; receives Return QR or online settlement |
| **Bank / CA** | KYC, issues attested certs, address statements by `accountId` |
| **Ramp (US / IN)** | Fiat treasury → Fabric `Mint` (and future burn/off-ramp) |
| **Annadata BFF** | Talks to Fabric peers; phone uses HTTP only |
| **Auditor / dispute** | Verifies address/geo statements against receipt hashes |

---

## 1. New user gets a wallet (and a backup)

**Status:** Done  
**Who:** Any customer (US or India).

1. App calls `createWallet()` → Ed25519 keypair on device; `accountId` is derived from the public key.
2. Optional: `backupEncryptedWallet(wallet, passphrase)` → AES-GCM blob.
3. App writes `nidhi-wallet.vault.json` into the **user’s** Google Drive / iCloud folder `annadataai` (via `CloudVaultAdapter`).

Annadata never stores the raw private key. Cloud holds ciphertext only.

**APIs:** `createWallet`, `backupEncryptedWallet`, `writeEncryptedVaultToCloud`, `CLOUD_VAULT_FILENAME`, `ANNADATA_CLOUD_FOLDER`

---

## 2. KYC at the bank (address commitment)

**Status:** Done (directory + cert APIs; live KYC ops are bank-side)  
**Who:** Buyer, vendor, later lender / banker.

1. Party submits postal address during onboarding.
2. Bank CA computes `addressCommitment` and issues `issueAttestedCert` / enrolls in `PartyDirectory`.
3. Public cert carries the **hash**, not street lines.
4. Later payments snapshot `addressCommitments` so a KYC update cannot rewrite history.

**APIs:** `MemoryPartyDirectory` / `HttpPartyDirectory`, `issueAttestedCert`, `verifyIdentityCert`, `addressCommitment`

---

## 3. On-ramp: put fiat onto Nidhi

**Status:** Partial (quote + mint; live ACH/UPI/FX oracle = Next)  
**Who:** Customer + Annadata treasury.

| Corridor | Fiat in | Token minted | Treasury label |
|----------|---------|--------------|----------------|
| US | USD | `NIDHI-USD` | annadata.ai USA bank account |
| IN | INR | `NIDHI-INR` | annadata.ai India bank account |

1. App detects corridor (`detectCorridor`) or user overrides.
2. `buildOnRampIntent({ corridor, fiatAmount })` builds a quote (1:1 today; cross FX helper exists).
3. After fiat settles in the treasury, a **ramp MSP** calls Fabric `Mint` (BFF / `PeerFabricGateway.mint`).

Demo: `InMemoryFabricGateway.mint(accountId, tokenId, amount)`.

**APIs:** `detectCorridor`, `buildOnRampIntent`, `quoteFx`, `TREASURY_LABELS`, `mint`

---

## 4. Pay a stall (offline-capable Return QR) — main story

**Status:** Done  
**Who:** Buyer at a stall; vendor with a printed QR.

1. Stall shows **Vendor Pay QR** = `accountId` only (± optional amount) via `encodeVendorPayQr`.
2. Buyer scans → `decodeVendorPayQr`.
3. App loads bank certs: `lookupCert(buyer)`, `lookupCert(vendor)`.
4. App loads ledger balance: `getBalance` → e.g. `$5000`.
5. App captures GPS (`source: 'device'`) or IP geo for online (`source: 'ip'`).
6. `createOfflineReceipt` signs a passbook row: particulars, ref, debit `$22`, `balanceAfter` `$4978`.
7. If `balanceBefore < amount` → throws **Insufficient funds** (no signature).
8. Buyer shows **Return QR** (`encodeReturnQrPayload`).
9. Vendor (or app when online) submits → `submitOfflineReceipt` → Fabric `SubmitReceipt`.

Same `$22` is **Dr** on the buyer passbook and **Cr** on the vendor passbook.

**APIs:** `encodeVendorPayQr`, `decodeVendorPayQr`, `createOfflineReceipt`, `encodeReturnQrPayload`, `decodeReturnQrPayload`, `submitOfflineReceipt`

---

## 5. Pay while online (no QR dance)

**Status:** Done  
**Who:** In-app transfer.

Buyer builds `createTransferIntent` → `signTransfer` → `submitTransfer` (Fabric `Transfer`). Still user-signed; peers verify Ed25519 and that `from` matches the signer’s `accountId`.

**APIs:** `createTransferIntent`, `signTransfer`, `verifySignedTransfer`, `submitTransfer`

---

## 6. Show me my passbook

**Status:** Done  
**Who:** Buyer or vendor in the app.

`buildPassbookFromGateway` (or `buildPassbook` on local history) renders bank-style pages:

- Date, Particulars, Cheque/Ref, Withdrawal (Dr), Deposit (Cr), Balance
- **B/F** (brought forward) and **C/F** (carried forward) when a page fills

**APIs:** `buildPassbook`, `buildPassbookFromGateway`, `formatPassbookDate`, `formatPassbookAmount`, `PASSBOOK_COLUMNS`, `PASSBOOK_ABBREVIATIONS`

---

## 7. “Where does this party live?” (address statement)

**Status:** Done  
**Who:** Bank, auditor, dispute desk.

Street address is **not** on any QR. Verifier asks the bank:

`lookupAddressStatement(accountId, 'vendor' | 'buyer' | …)`

Checks:

1. Address hashes to `cert.addressCommitment`
2. Commitment matches the receipt’s `addressCommitments[role]`
3. CA signature verifies against a trusted CA public key

**APIs:** `lookupAddressStatement`, `createAddressStatement`, `verifyAddressStatement`

---

## 8. “Where was this payment made?” (geo statement)

**Status:** Done  
**Who:** Dispute / compliance.

Receipt stores only `geoSource` + `geoCommitment`. On request, holder reveals coordinates via `createGeoStatement(receipt, point)`. Verifier checks hash match; raw lat/lon never rode the Return QR.

**APIs:** `geoCommitment`, `createGeoStatement`, `verifyGeoStatement`

---

## 9. Phone lost / stolen

**Status:** Done (vault + Fabric history; bank verify optional)  
**Who:** Same user, new device.

1. Restore vault from Drive/iCloud + passphrase → `restoreEncryptedWallet`.
2. Pull authority history: `buildVerifyBundle(gateway, accountId)` (+ optional cert).
3. Rebuild UI / passbook from Fabric; keys never lived on Annadata servers.

**APIs:** `readEncryptedVaultFromCloud`, `restoreEncryptedWallet`, `buildVerifyBundle`, `verifyBundleLocally`

---

## 10. Off-ramp: cash out to bank

**Status:** Partial (quote only; live payout = Next)  
**Who:** Customer cashing out.

`buildOffRampIntent({ corridor, tokenAmount })` → token → home-corridor fiat quote against the matching treasury. Real burn + ACH/UPI/NEFT payout is not wired yet.

**APIs:** `buildOffRampIntent`, `quoteFx`

---

## 11. Vendor queues receipts offline, settles later

**Status:** Done  
**Who:** Stall with intermittent connectivity.

1. Vendor scans Return QR → `decodeReturnQrPayload` (verifies signature).
2. Save locally: `MemoryOfflineReceiptStore.save` (app later plugs IndexedDB).
3. When online: `submitOfflineReceipt` → remove from queue on commit.
4. Replay of the same `from:nonce` is rejected on Fabric.

**APIs:** `OfflineReceiptStore`, `MemoryOfflineReceiptStore`, `submitOfflineReceipt`

---

## 12. Insufficient funds / tamper rejection

**Status:** Done  
**Who:** Buyer UX and settlement safety.

| Layer | Behavior |
|-------|----------|
| Receipt create | `balanceBefore < amount` → throw; no signature |
| Receipt verify | Wrong `balanceAfter`, particulars, commitments, or geo → fail |
| Fabric settle | Insufficient ledger balance, bad sig, or replay → `rejected` |

Protects honest offline signing and dishonest rewriting of a Return QR.

**APIs:** `createOfflineReceipt`, `verifyOfflineReceipt`, chaincode / `InMemoryFabricGateway`

---

## 13. Import / migrate an existing key

**Status:** Done  
**Who:** Power user or recovery from a known seed hex.

`importWalletFromPrivateKeyHex` or `importWalletJson` rebuilds the same `accountId`. Useful after exporting a vault elsewhere or moving between demo environments.

**APIs:** `importWalletFromPrivateKeyHex`, `exportWalletJson`, `importWalletJson`

---

## 14. Corridor auto-detect (US vs India)

**Status:** Done  
**Who:** App onboarding / pay screen defaults.

`detectCorridor({ countryCode, locale })` → `'US' | 'IN'` (defaults India-first). Maps to default token and fiat for ramp quotes.

**APIs:** `detectCorridor`, `tokenForCorridor`, `fiatForCorridor`

---

## 15. Cross-corridor FX quote (display / future swap)

**Status:** Partial  
**Who:** US buyer paying an IN vendor (or reverse).

`quoteFx` can convert USD↔INR sides with an injected `usdInrRate` (no live oracle yet). Full on-ledger FX swap chaincode is not in this package.

**APIs:** `quoteFx`

---

## 16. Lender / banker on a receipt (optional parties)

**Status:** Done (types + commitments)  
**Who:** Credit / facilitated payments.

`addressCommitments` may include `lender` and `banker` hashes from the bank directory when those parties are part of the payment. Same statement flow as vendor/buyer when someone asks for an address.

**APIs:** `PartyRole`, `AddressCommitments`, `PartyDirectory`

---

## 17. Annadata BFF / ramp ops mint

**Status:** Done (chaincode + peer adapter)  
**Who:** Backend after treasury credit confirmed.

Phone uses `HttpFabricGateway`. BFF uses `connectPeerFabricGateway` from `@annadata/nidhi/peer`. Only allow-listed MSPs may mint: `Org1MSP` (test-net), `RampUSMSP`, `RampINMSP`, `AnnadataTrustMSP`.

User private keys never go to the BFF.

**APIs:** `HttpFabricGateway`, `PeerFabricGateway`, `connectPeerFabricGateway`, chaincode `Mint`

---

## 18. Print / display a stall Pay QR

**Status:** Done  
**Who:** Vendor setup.

Vendor generates `encodeVendorPayQr({ accountId, amount?, tokenId? })` once (or per price). No address, no GPS, no PII on the sticker.

**APIs:** `encodeVendorPayQr`, `decodeVendorPayQr`

---

## Flow map (happy path)

```text
Create wallet → KYC (bank cert) → On-ramp mint
        │
        ▼
Scan Vendor Pay QR → lookup certs + balance + geo
        │
        ▼
Sign OfflineReceipt (passbook row) → Return QR
        │
        ▼
Vendor queue / submit → Fabric settle → Passbook view
        │
        ├── Address / geo statement on dispute
        ├── Cloud vault if phone lost
        └── Off-ramp quote when cashing out
```

---

## Related docs

- Library overview and install: [README.md](../README.md)
- Go chaincode deploy: [network/deploy-test-network.sh](../network/deploy-test-network.sh)
