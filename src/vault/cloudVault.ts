/**
 * Cloud vault ports — app wires Google Drive / iCloud Documents.
 * Library only defines the contract + encrypt helpers.
 */

import type { EncryptedVaultBlob } from './encrypt';
import { ANNADATA_CLOUD_FOLDER, CLOUD_VAULT_FILENAME } from '../identity/wallet';

export interface CloudVaultAdapter {
  /** Ensure `annadataai` (or equivalent) exists; return folder id/path. */
  ensureFolder(folderName?: string): Promise<string>;
  writeJson(fileName: string, json: unknown): Promise<void>;
  readJson<T = unknown>(fileName: string): Promise<T | null>;
}

export { ANNADATA_CLOUD_FOLDER, CLOUD_VAULT_FILENAME };

export async function writeEncryptedVaultToCloud(
  adapter: CloudVaultAdapter,
  blob: EncryptedVaultBlob,
  fileName: string = CLOUD_VAULT_FILENAME
): Promise<void> {
  await adapter.ensureFolder(ANNADATA_CLOUD_FOLDER);
  await adapter.writeJson(fileName, blob);
}

export async function readEncryptedVaultFromCloud(
  adapter: CloudVaultAdapter,
  fileName: string = CLOUD_VAULT_FILENAME
): Promise<EncryptedVaultBlob | null> {
  await adapter.ensureFolder(ANNADATA_CLOUD_FOLDER);
  return adapter.readJson<EncryptedVaultBlob>(fileName);
}

/** In-memory adapter for tests. */
export class MemoryCloudVaultAdapter implements CloudVaultAdapter {
  private files = new Map<string, unknown>();
  folderReady = false;

  async ensureFolder(_folderName = ANNADATA_CLOUD_FOLDER): Promise<string> {
    this.folderReady = true;
    return ANNADATA_CLOUD_FOLDER;
  }

  async writeJson(fileName: string, json: unknown): Promise<void> {
    this.files.set(fileName, json);
  }

  async readJson<T = unknown>(fileName: string): Promise<T | null> {
    if (!this.files.has(fileName)) return null;
    return this.files.get(fileName) as T;
  }
}
