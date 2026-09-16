import { describe, expect, it } from 'vitest';
import {
  InMemoryFabricGateway,
  MemoryCloudVaultAdapter,
  MemoryOfflineReceiptStore,
  MemoryPartyDirectory,
  PASSBOOK_ABBREVIATIONS,
  backupEncryptedWallet,
  buildOnRampIntent,
  buildPassbook,
  buildPassbookFromGateway,
  buildVerifyBundle,
  createGeoStatement,
  createOfflineReceipt,
  createWallet,
  decodeReturnQrPayload,
  decodeVendorPayQr,
  detectCorridor,
  encodeReturnQrPayload,
  encodeVendorPayQr,
  geoCommitment,
  restoreEncryptedWallet,
  signTransfer,
  createTransferIntent,
  tokenForCorridor,
  verifyAddressStatement,
  verifyBundleLocally,
  verifyGeoStatement,
  verifyIdentityCert,
  verifyOfflineReceipt,
  verifySignedTransfer,
  writeEncryptedVaultToCloud,
  readEncryptedVaultFromCloud,
  PeerFabricGateway,
} from '../index';

describe('@annadata/nidhi wallet + pay', () => {
  it('creates wallet and verifies offline receipt round-trip QR', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '150',
      tokenId: 'NIDHI-INR',
      balanceBefore: '1000',
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
      balanceBefore: '10',
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
      balanceBefore: '100',
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

const sampleAddress = (name: string) => ({
  legalName: name,
  line1: '12 Market Road',
  city: 'Bengaluru',
  region: 'KA',
  postalCode: '560001',
  country: 'IN',
});

describe('offline receipt passbook balances', () => {
  it('signs remaining balance 5000 − 22 = 4978', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '22',
      tokenId: 'NIDHI-USD',
      balanceBefore: '5000',
      particulars: 'UPI/12345/Tea Vendor',
      chequeOrRefNo: '000142',
      initials: 'NDH',
    });
    expect(receipt.balanceAfter).toBe('4978');
    expect(receipt.particulars).toBe('UPI/12345/Tea Vendor');
    expect(verifyOfflineReceipt(receipt)).toBe(true);
  });

  it('throws insufficient funds when balanceBefore < amount', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    expect(() =>
      createOfflineReceipt(buyer, {
        to: vendor.accountId,
        amount: '22',
        tokenId: 'NIDHI-USD',
        balanceBefore: '20',
      })
    ).toThrow(/Insufficient funds/);
  });

  it('rejects tampered balanceAfter, particulars, and addressCommitments', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '22',
      tokenId: 'NIDHI-USD',
      balanceBefore: '5000',
      particulars: 'TO TRANSFER / stall',
      addressCommitments: { buyer: 'aa', vendor: 'bb' },
    });
    expect(verifyOfflineReceipt({ ...receipt, balanceAfter: '9999' })).toBe(false);
    expect(verifyOfflineReceipt({ ...receipt, particulars: 'forged' })).toBe(false);
    expect(
      verifyOfflineReceipt({
        ...receipt,
        addressCommitments: { buyer: 'aa', vendor: 'ff' },
      })
    ).toBe(false);
  });
});

describe('bank party directory + address statements', () => {
  it('looks up vendor cert by accountId and binds commitments on the receipt', async () => {
    const ca = createWallet();
    const buyer = createWallet();
    const vendor = createWallet();
    const directory = new MemoryPartyDirectory();
    const buyerAddr = sampleAddress('Buyer');
    const vendorAddr = { ...sampleAddress('Tea Stall'), line1: '9 Stall Lane' };
    directory.enroll(ca, buyer, buyerAddr);
    directory.enroll(ca, vendor, vendorAddr);

    const buyerCert = await directory.lookupCert(buyer.accountId);
    const vendorCert = await directory.lookupCert(vendor.accountId);
    expect(verifyIdentityCert(buyerCert, ca.publicKeyHex)).toBe(true);
    expect(verifyIdentityCert(vendorCert, ca.publicKeyHex)).toBe(true);

    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '22',
      tokenId: 'NIDHI-USD',
      balanceBefore: '5000',
      addressCommitments: {
        buyer: buyerCert.addressCommitment,
        vendor: vendorCert.addressCommitment,
      },
    });
    expect(receipt.addressCommitments?.vendor).toBe(vendorCert.addressCommitment);

    const vendorStmt = await directory.lookupAddressStatement(vendor.accountId, 'vendor');
    expect(
      verifyAddressStatement(vendorStmt, {
        trustedCaPublicKeyHex: ca.publicKeyHex,
        expectedCommitment: receipt.addressCommitments?.vendor,
      })
    ).toBe(true);
    expect(vendorStmt.address.legalName).toBe('Tea Stall');

    const swapped = { ...vendorStmt, address: buyerAddr };
    expect(
      verifyAddressStatement(swapped, { trustedCaPublicKeyHex: ca.publicKeyHex })
    ).toBe(false);
  });

  it('fails lookup for unknown accountId', async () => {
    const directory = new MemoryPartyDirectory();
    await expect(directory.lookupCert('NOBODY01')).rejects.toThrow(/Unknown account/);
  });

  it('rejects certs signed by the wrong CA', async () => {
    const ca = createWallet();
    const otherCa = createWallet();
    const vendor = createWallet();
    const directory = new MemoryPartyDirectory();
    directory.enroll(ca, vendor, sampleAddress('Vendor'));
    const cert = await directory.lookupCert(vendor.accountId);
    expect(verifyIdentityCert(cert, otherCa.publicKeyHex)).toBe(false);
  });
});

describe('buyer geo on receipt', () => {
  const stallGeo = { latitude: 12.9716, longitude: 77.5946, timestamp: 1_700_000_000_000 };

  it('hashes device GPS into the receipt and reveals it via geo statement', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '22',
      tokenId: 'NIDHI-USD',
      balanceBefore: '5000',
      geo: { source: 'device', point: stallGeo },
    });
    expect(receipt.geoSource).toBe('device');
    expect(receipt.geoCommitment).toBe(geoCommitment(stallGeo));
    const qr = JSON.parse(encodeReturnQrPayload(receipt)) as { latitude?: number };
    expect(qr.latitude).toBeUndefined();

    const stmt = createGeoStatement(receipt, stallGeo);
    expect(verifyGeoStatement(stmt, { expectedCommitment: receipt.geoCommitment })).toBe(true);
    expect(
      verifyGeoStatement(
        { ...stmt, point: { ...stallGeo, latitude: 13.0 } },
        { expectedCommitment: receipt.geoCommitment }
      )
    ).toBe(false);
  });

  it('accepts IP geolocation source for online purchase', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const ipGeo = { latitude: 37.7749, longitude: -122.4194, timestamp: 1_700_000_000_000 };
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '22',
      tokenId: 'NIDHI-USD',
      balanceBefore: '5000',
      geo: { source: 'ip', point: ipGeo },
    });
    expect(receipt.geoSource).toBe('ip');
    expect(verifyOfflineReceipt({ ...receipt, geoCommitment: '00'.repeat(32) })).toBe(false);
  });

  it('round-trips vendor Pay QR with accountId only', () => {
    const vendor = createWallet();
    const raw = encodeVendorPayQr({ accountId: vendor.accountId, amount: '22', tokenId: 'NIDHI-USD' });
    const qr = decodeVendorPayQr(raw);
    expect(qr.accountId).toBe(vendor.accountId);
    expect(qr.kind).toBe('vendor_pay_qr');
  });
});

describe('passbook view', () => {
  it('shows B/F 5000, withdrawal 22, balance 4978', async () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const gw = new InMemoryFabricGateway();
    gw.mint(buyer.accountId, 'NIDHI-USD', '5000');
    const { amount: balanceBefore } = await gw.getBalance(buyer.accountId, 'NIDHI-USD');
    const receipt = createOfflineReceipt(buyer, {
      to: vendor.accountId,
      amount: '22',
      tokenId: 'NIDHI-USD',
      balanceBefore,
      particulars: 'UPI/12345/Tea Vendor',
    });
    const committed = await gw.submitOfflineReceipt(receipt);
    expect(committed.status).toBe('committed');

    const history = await gw.listTransactions(buyer.accountId);
    expect(history[0]?.balanceAfter).toBe('4978');
    expect(history[0]?.particulars).toBe('UPI/12345/Tea Vendor');

    const book = await buildPassbookFromGateway(gw, buyer.accountId, 'NIDHI-USD');
    expect(book.pages[0]?.broughtForward).toBe('5000');
    const entry = book.pages[0]?.rows.find((r) => r.kind === 'entry');
    expect(entry?.withdrawal).toBe('22');
    expect(entry?.deposit).toBe('');
    expect(entry?.balance).toBe('4978');
    expect(book.closingBalance).toBe('4978');
    expect(PASSBOOK_ABBREVIATIONS.Dr).toMatch(/out of your account/);
  });

  it('adds C/F when a page is full', () => {
    const accountId = 'BUYER001';
    const tokenId = 'NIDHI-USD' as const;
    const transactions = [1, 2, 3].map((n) => ({
      txId: `t${n}`,
      from: accountId,
      to: 'VENDOR01',
      amount: '10',
      tokenId,
      timestamp: n,
      nonce: `n${n}`,
      balanceBefore: String(100 - (n - 1) * 10),
      balanceAfter: String(100 - n * 10),
      particulars: `TO TRANSFER / ${n}`,
      chequeOrRefNo: `REF${n}`,
    }));
    const book = buildPassbook({ accountId, tokenId, transactions, rowsPerPage: 1 });
    expect(book.pages).toHaveLength(3);
    expect(book.pages[0]?.rows.some((r) => r.kind === 'cf')).toBe(true);
    expect(book.pages[0]?.carriedForward).toBe(book.pages[1]?.broughtForward);
    expect(book.pages[2]?.rows.some((r) => r.kind === 'cf')).toBe(false);
    expect(book.closingBalance).toBe('70');
  });
});

describe('peer fabric gateway + signer check', () => {
  it('rejects a transfer whose from does not match the signer account', () => {
    const buyer = createWallet();
    const vendor = createWallet();
    const intent = createTransferIntent({
      from: buyer.accountId,
      to: vendor.accountId,
      amount: '1',
      tokenId: 'NIDHI-USD',
    });
    const tx = signTransfer(buyer, intent);
    expect(verifySignedTransfer({ ...tx, from: vendor.accountId })).toBe(false);
  });

  it('submits signed JSON to Nidhi chaincode method names', async () => {
    const calls: { name: string; args: string[] }[] = [];
    const contract = {
      async submitTransaction(name: string, ...args: string[]) {
        calls.push({ name, args });
        return new TextEncoder().encode(JSON.stringify({ txId: 'peer_1', status: 'committed' }));
      },
      async evaluateTransaction(name: string, ...args: string[]) {
        calls.push({ name, args });
        if (name === 'GetBalance') {
          return new TextEncoder().encode(
            JSON.stringify({ accountId: args[0], tokenId: args[1], amount: '4978' })
          );
        }
        return new TextEncoder().encode('[]');
      },
    };
    const gw = new PeerFabricGateway(contract);
    const buyer = createWallet();
    const vendor = createWallet();
    const tx = signTransfer(
      buyer,
      createTransferIntent({
        from: buyer.accountId,
        to: vendor.accountId,
        amount: '22',
        tokenId: 'NIDHI-USD',
      })
    );
    const submitted = await gw.submitTransfer(tx);
    expect(submitted.status).toBe('committed');
    expect(calls[0]?.name).toBe('Transfer');
    expect(JSON.parse(calls[0]?.args[0] ?? '{}').amount).toBe('22');

    await gw.mint(buyer.accountId, 'NIDHI-USD', '5000');
    expect(calls[1]?.name).toBe('Mint');

    const bal = await gw.getBalance(buyer.accountId, 'NIDHI-USD');
    expect(bal.amount).toBe('4978');
    expect(calls[2]?.name).toBe('GetBalance');
  });
});

