declare module '@hyperledger/fabric-gateway' {
  export const hash: { sha256: unknown };
  export const signers: {
    newPrivateKeySigner(key: { type: string }): unknown;
  };
  export function connect(opts: {
    identity: { mspId: string; credentials: Uint8Array };
    signer: unknown;
    hash: unknown;
    client: unknown;
  }): {
    getNetwork(name: string): { getContract(name: string): unknown };
    close(): void;
  };
}

declare module '@grpc/grpc-js' {
  export class Client {
    constructor(endpoint: string, creds: unknown);
    close(): void;
  }
  export const credentials: {
    createSsl(cert: Uint8Array): unknown;
  };
}
