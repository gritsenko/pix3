import { injectable } from '@/fw/di';
import * as ApiClient from './ApiClient';
import type { ManifestEntry } from './ApiClient';

export interface SyncResult {
  downloaded: string[];
  deleted: string[];
  unchanged: string[];
}

@injectable()
export class LocalSyncService {
  async syncToLocal(projectId: string, dirHandle: FileSystemDirectoryHandle): Promise<SyncResult> {
    const result: SyncResult = { downloaded: [], deleted: [], unchanged: [] };

    // 1. Get server manifest
    const { files: serverFiles } = await ApiClient.getManifest(projectId);
    const serverMap = new Map<string, ManifestEntry>();
    for (const entry of serverFiles) {
      if (entry.kind !== 'file') {
        continue;
      }
      serverMap.set(entry.path, entry);
    }

    // 2. Build local manifest by walking the directory
    const localHashes = await this.buildLocalManifest(dirHandle);

    // 3. Download new or changed files
    for (const [filePath, serverEntry] of serverMap) {
      const localHash = localHashes.get(filePath);
      if (localHash === serverEntry.hash) {
        result.unchanged.push(filePath);
        continue;
      }

      const response = await ApiClient.downloadFile(projectId, filePath);
      const content = await response.arrayBuffer();
      await this.writeFile(dirHandle, filePath, content);
      result.downloaded.push(filePath);
    }

    // 4. Delete local files not on server
    for (const localPath of localHashes.keys()) {
      if (!serverMap.has(localPath)) {
        await this.deleteFile(dirHandle, localPath);
        result.deleted.push(localPath);
      }
    }

    return result;
  }

  async uploadFromLocal(
    projectId: string,
    dirHandle: FileSystemDirectoryHandle
  ): Promise<{ uploaded: string[] }> {
    const { files: serverFiles } = await ApiClient.getManifest(projectId);
    const serverMap = new Map<string, ManifestEntry>();
    for (const entry of serverFiles) {
      if (entry.kind !== 'file') {
        continue;
      }
      serverMap.set(entry.path, entry);
    }

    const localHashes = await this.buildLocalManifest(dirHandle);
    const uploaded: string[] = [];

    for (const [filePath, localHash] of localHashes) {
      const serverEntry = serverMap.get(filePath);
      if (serverEntry && serverEntry.hash === localHash) {
        continue;
      }

      const content = await this.readFile(dirHandle, filePath);
      await ApiClient.uploadFile(projectId, filePath, content);
      uploaded.push(filePath);
    }

    return { uploaded };
  }

  private async buildLocalManifest(
    dirHandle: FileSystemDirectoryHandle,
    prefix = ''
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const iterableDirHandle = dirHandle as FileSystemDirectoryHandle & {
      entries(): AsyncIterable<[string, FileSystemHandle]>;
    };

    for await (const [name, handle] of iterableDirHandle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        const sub = await this.buildLocalManifest(handle as FileSystemDirectoryHandle, path);
        for (const [k, v] of sub) {
          result.set(k, v);
        }
      } else {
        const file = await (handle as FileSystemFileHandle).getFile();
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        result.set(path, hash);
      }
    }

    return result;
  }

  private async writeFile(
    rootHandle: FileSystemDirectoryHandle,
    filePath: string,
    content: ArrayBuffer
  ): Promise<void> {
    const parts = filePath.split('/');
    let dir = rootHandle;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  private async readFile(
    rootHandle: FileSystemDirectoryHandle,
    filePath: string
  ): Promise<ArrayBuffer> {
    const parts = filePath.split('/');
    let dir = rootHandle;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  }

  private async deleteFile(rootHandle: FileSystemDirectoryHandle, filePath: string): Promise<void> {
    const parts = filePath.split('/');
    let dir = rootHandle;
    for (const part of parts.slice(0, -1)) {
      try {
        dir = await dir.getDirectoryHandle(part);
      } catch {
        return; // parent directory doesn't exist, nothing to delete
      }
    }
    try {
      await dir.removeEntry(parts[parts.length - 1]);
    } catch {
      // file may already be deleted
    }
  }
}
