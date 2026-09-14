# @annadata/nidhi

Local-first Nidhi wallet library for Annadata (plan: Hyperledger Fabric settlement, dual US/IN fiat treasuries).

## Install (from annadata-app)

```bash
cd ref-code/nidhi && npm install && npm run build
```

In the app `package.json`:

```json
"@annadata/nidhi": "file:./ref-code/nidhi"
```

## Capabilities (v0.1)

| Area | Status |
|------|--------|
| Ed25519 wallet create / import | Done |
| Offline signed receipt + Return QR encode/decode | Done |
| Encrypted cloud vault blob (passphrase AES-GCM) | Done |
| Cloud vault adapter port (wire GDrive/iCloud in app) | Done |
| In-memory Fabric gateway (demo) + HTTP gateway client | Done |
| US / IN corridor detect + on/off-ramp quote helpers | Done |
| Verify bundle from gateway history (lost-phone) | Done |
| Real Fabric peers / chaincode | Next |
| Live FX oracle + bank treasury APIs | Next |

## Quick usage

```ts
import {
  createWallet,
  createOfflineReceipt,
  encodeReturnQrPayload,
  backupEncryptedWallet,
  InMemoryFabricGateway,
  signTransfer,
  createTransferIntent,
  buildOnRampIntent,
} from '@annadata/nidhi';

const buyer = createWallet();
const receipt = createOfflineReceipt(buyer, {
  to: 'VENDOR01',
  amount: '150',
  tokenId: 'NIDHI-INR',
});
const qr = encodeReturnQrPayload(receipt);

const vault = await backupEncryptedWallet(buyer, 'user-passphrase');
// app writes vault JSON to user GDrive/iCloud folder annadataai

const gw = new InMemoryFabricGateway();
gw.mint(buyer.accountId, 'NIDHI-INR', '500');
await gw.submitTransfer(
  signTransfer(
    buyer,
    createTransferIntent({
      from: buyer.accountId,
      to: 'VENDOR01',
      amount: '150',
      tokenId: 'NIDHI-INR',
    })
  )
);

buildOnRampIntent({ corridor: 'US', fiatAmount: '100' }); // → NIDHI-USD via USA treasury
buildOnRampIntent({ corridor: 'IN', fiatAmount: '1000' }); // → NIDHI-INR via India treasury
```

## Design notes

- **No central user ledger in this library** — balances live behind `FabricGateway`.
- **Keys** stay on device; cloud holds **encrypted** `nidhi-wallet.vault.json` only.
- **annadata.ai USA + India bank accounts** are ramp float (see `TREASURY_LABELS`), not the Fabric world state.
