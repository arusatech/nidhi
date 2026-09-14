import { describe, expect, it } from 'vitest';
import {
  InMemoryFabricGateway,
  MemoryCloudVaultAdapter,
  MemoryOfflineReceiptStore,
  backupEncryptedWallet,
  buildOnRampIntent,
  buildVerifyBundle,
  createOfflineReceipt,
  createWallet,
  decodeReturnQrPayload,
  detectCorridor,
  encodeReturnQrPayload,
  restoreEncryptedWallet,
  signTransfer,
  createTransferIntent,
  tokenForCorridor,
  verifyBundleLocally,
  verifyOfflineReceipt,
  writeEncryptedVaultToCloud,
  readEncryptedVaultFromCloud,
} from '../index';

describe('@annadata/nidhi wallet + pay', () => {
  it('creates wallet and verifies offline receipt round-trip QR', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '150',
      tokenId: 'NIDHI-INR',
    });
    expect(verifyOfflineReceipt(receipt)).toBe(true);
    const qr = encodeReturnQrPayload(receipt);
    const again = decodeReturnQrPayload(qr);
    expect(again.nonce).toBe(receipt.nonce);
    expect(again.from).toBe(buyer.accountId);
  });

  it('rejects tampered receipt', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '10',
      tokenId: 'NIDHI-USD',
    });
    const bad = { ...receipt, amount: '999' };
    expect(verifyOfflineReceipt(bad)).toBe(false);
  });
});

describe('cloud vault', () => {
  it('encrypts wallet and restores via memory cloud adapter', async () => {
    const wallet = createWallet();
    const blob = await backupEncryptedWallet(wallet, 'test-passphrase-ok');
    const cloud = new MemoryCloudVaultAdapter();
    await writeEncryptedVaultToCloud(cloud, blob);
    const loaded = await readEncryptedVaultFromCloud(cloud);
    expect(loaded).not.toBeNull();
    const restored = await restoreEncryptedWallet(loaded!, 'test-passphrase-ok');
    expect(restored.accountId).toBe(wallet.accountId);
    expect(restored.publicKeyHex).toBe(wallet.publicKeyHex);
  });
});

describe('fabric in-memory gateway', () => {
  it('settles signed transfer and lists history for recovery', async () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const gw = new InMemoryFabricGateway();
    gw.mint(buyer.accountId, 'NIDHI-INR', '500');

    const intent = createTransferIntent({
      from: buyer.accountId,
      to: vendor.accountId,
      amount: '150',
      tokenId: 'NIDHI-INR',
    });
    const tx = signTransfer(buyer, intent);
    const result = await gw.submitTransfer(tx);
    expect(result.status).toBe('committed');

    const buyerBal = await gw.getBalance(buyer.accountId, 'NIDHI-INR');
    const vendorBal = await gw.getBalance(vendor.accountId, 'NIDHI-INR');
    expect(buyerBal.amount).toBe('350');
    expect(vendorBal.amount).toBe('150');

    const bundle = await buildVerifyBundle(gw, buyer.accountId);
    expect(verifyBundleLocally(bundle)).toBe(true);
    expect(bundle.transactions).toHaveLength(1);

    // replay blocked
    const replay = await gw.submitTransfer(tx);
    expect(replay.status).toBe('rejected');
  });

  it('queues offline receipts then settles', async () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const store = new MemoryOfflineReceiptStore();
    const gw = new InMemoryFabricGateway();
    gw.mint(buyer.accountId, 'NIDHI-USD', '100');

    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '25',
      tokenId: 'NIDHI-USD',
    });
    await store.save(receipt);
    expect((await store.list()).length).toBe(1);

    const r = await gw.submitOfflineReceipt(receipt);
    expect(r.status).toBe('committed');
    await store.remove(receipt.nonce);
    expect((await store.list()).length).toBe(0);
  });
});

describe('US / IN corridors', () => {
  it('detects corridor and builds on-ramp intent', () => {
    expect(detectCorridor({ countryCode: 'US' })).toBe('US');
    expect(detectCorridor({ locale: 'en-IN' })).toBe('IN');
    expect(tokenForCorridor('US')).toBe('NIDHI-USD');
    expect(tokenForCorridor('IN')).toBe('NIDHI-INR');

    const intent = buildOnRampIntent({ corridor: 'US', fiatAmount: '100' });
    expect(intent.tokenId).toBe('NIDHI-USD');
    expect(intent.tokenAmount).toBe('100');
  });
});
