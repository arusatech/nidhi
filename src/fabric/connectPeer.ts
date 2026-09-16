/**
 * Optional BFF helper: connect @hyperledger/fabric-gateway to Nidhi chaincode.
 * Not used by the Ionic app — install peer deps only on the Node BFF:
 *   npm i @hyperledger/fabric-gateway @grpc/grpc-js
 */

import { createPrivateKey } from 'node:crypto';
import { PeerFabricGateway, type FabricContract } from './peerGateway';

export interface PeerConnectOptions {
  mspId: string;
  peerEndpoint: string;
  tlsRootCert: Uint8Array;
  certificate: Uint8Array;
  privateKeyPem: string;
  channelName?: string;
  chaincodeName?: string;
}

export interface PeerFabricConnection {
  gateway: PeerFabricGateway;
  close: () => void;
}

export async function connectPeerFabricGateway(
  opts: PeerConnectOptions
): Promise<PeerFabricConnection> {
  let fabric: typeof import('@hyperledger/fabric-gateway');
  let grpc: typeof import('@grpc/grpc-js');
  try {
    fabric = await import('@hyperledger/fabric-gateway');
    grpc = await import('@grpc/grpc-js');
  } catch {
    throw new Error(
      'connectPeerFabricGateway requires @hyperledger/fabric-gateway and @grpc/grpc-js (BFF only)'
    );
  }

  const privateKey = createPrivateKey(opts.privateKeyPem);
  const signer = fabric.signers.newPrivateKeySigner(privateKey);
  const client = new grpc.Client(
    opts.peerEndpoint,
    grpc.credentials.createSsl(Buffer.from(opts.tlsRootCert))
  );
  const connected = fabric.connect({
    identity: { mspId: opts.mspId, credentials: Buffer.from(opts.certificate) },
    signer,
    hash: fabric.hash.sha256,
    client,
  });
  const contract = connected
    .getNetwork(opts.channelName ?? 'nidhi-payments')
    .getContract(opts.chaincodeName ?? 'nidhi') as unknown as FabricContract;

  return {
    gateway: new PeerFabricGateway(contract),
    close: () => {
      connected.close();
      client.close();
    },
  };
}
