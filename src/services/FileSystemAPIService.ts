import { parse } from 'yaml';

import { injectable, ServiceContainer } from '@/fw/di';

export type FileSystemAPIErrorCode =
  | 'not-initialized'
  | 'permission-denied'
  | 'not-found'
  | 'invalid-path'
  | 'unsupported'
  | 'parse-error'
  | 'unknown';

export class FileSystemAPIError extends Error {
  readonly code: FileSystemAPIErrorCode;
  readonly cause?: unknown;

  constructor(code: FileSystemAPIErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'FileSystemAPIError';
    this.code = code;
    this.cause = cause;
  }
}

export interface FileDescriptor {
  readonly name: string;
  readonly kind: FileSystemHandleKind;
  readonly path: string;
}

export interface FileSystemAPIServiceOptions {
  readonly directoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  readonly yamlParser?: (contents: string) => unknown;
  readonly logger?: (message: string, error?: unknown) => void;
  readonly resourcePrefix?: string;
}

export interface ReadSceneResult<TScene = unknown> {
  readonly scene: TScene;
  readonly raw: string;
}

const DEFAULT_RESOURCE_PREFIX = 'res://';

type PermissionMode = 'read' | 'readwrite';
type PermissionState = 'prompt' | 'granted' | 'denied';

@injectable()
export class FileSystemAPIService {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private readonly directoryPicker: () => Promise<FileSystemDirectoryHandle>;
  private readonly parseYaml: (contents: string) => unknown;
  private readonly logger?: (message: string, error?: unknown) => void;
  private readonly resourcePrefix: string;

  constructor(options: FileSystemAPIServiceOptions = {}) {
    this.directoryPicker = options.directoryPicker ?? this.getDefaultDirectoryPicker();
    this.parseYaml = options.yamlParser ?? ((contents: string) => parse(contents));
    this.logger = options.logger;
    this.resourcePrefix = options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX;
  }

  dispose(): void {
    this.directoryHandle = null;
  }

  setProjectDirectory(handle: FileSystemDirectoryHandle): void {
    this.directoryHandle = handle;
  }

  getProjectDirectory(): FileSystemDirectoryHandle | null {
    return this.directoryHandle;
  }

  async requestProjectDirectory(
    mode: PermissionMode = 'readwrite'
  ): Promise<FileSystemDirectoryHandle> {
    try {
      const handle = await this.directoryPicker();
      await this.ensurePermission(handle, mode);
      this.directoryHandle = handle;
      return handle;
    } catch (error) {
      throw this.normalizeError(error, 'Failed to request project directory');
    }
  }

  async ensurePermission(
    handle: FileSystemHandle | null = this.directoryHandle,
    mode: PermissionMode = 'read'
  ): Promise<void> {
    if (!handle) {
      throw new FileSystemAPIError('not-initialized', 'Project directory has not been set.');
    }

    const permissionHandle = handle as FileSystemHandle & {
      queryPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionState>;
      requestPermission?: (descriptor: { mode: PermissionMode }) => Promise<PermissionState>;
    };

    if (!permissionHandle.queryPermission || !permissionHandle.requestPermission) {
      throw new FileSystemAPIError(
        'unsupported',
        'Permission APIs are unavailable in this environment.'
      );
    }

    const queryResult = await permissionHandle.queryPermission({ mode });

    if (queryResult === 'granted') {
      return;
    }

    const requestResult = await permissionHandle.requestPermission({ mode });

    if (requestResult !== 'granted') {
      throw new FileSystemAPIError(
        'permission-denied',
        'Permission denied for requested operation.'
      );
    }
  }

  async readTextFile(path: string, options?: { mode?: PermissionMode }): Promise<string> {
    const fileHandle = await this.resolveFileHandle(path, options?.mode ?? 'read');
    try {
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      throw this.normalizeError(error, `Failed to read file at ${path}`);
    }
  }

  async readScene<TScene = unknown>(
    path: string,
    options?: { mode?: PermissionMode }
  ): Promise<ReadSceneResult<TScene>> {
    const text = await this.readTextFile(path, options);
    try {
      const scene = this.parseYaml(text) as TScene;
      return { scene, raw: text };
    } catch (error) {
      throw new FileSystemAPIError('parse-error', `Failed to parse YAML at ${path}`, error);
    }
  }

  async listDirectory(path = '.', options?: { mode?: PermissionMode }): Promise<FileDescriptor[]> {
    const directory = await this.resolveDirectoryHandle(path, options?.mode ?? 'read');
    const entries: FileDescriptor[] = [];

    try {
      const directoryWithEntries = directory as FileSystemDirectoryHandle & {
        entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
        values?: () => AsyncIterableIterator<FileSystemHandle & { name?: string }>;
      };

      if (directoryWithEntries.entries) {
        for await (const [name, handle] of directoryWithEntries.entries()) {
          entries.push({
            name,
            kind: handle.kind,
            path: this.joinPath(path, name),
          });
        }
        return entries;
      }

      if (directoryWithEntries.values) {
        let index = 0;
        for await (const handle of directoryWithEntries.values()) {
          entries.push({
            name: (handle as FileSystemHandle).name ?? `entry-${index}`,
            kind: handle.kind,
            path: this.joinPath(path, (handle as FileSystemHandle).name ?? `entry-${index}`),
          });
          index += 1;
        }
        return entries;
      }
    } catch (error) {
      throw this.normalizeError(error, `Failed to list directory at ${path}`);
    }

    return entries;
  }

  async getFileHandle(
    path: string,
    options?: { mode?: PermissionMode }
  ): Promise<FileSystemFileHandle> {
    return this.resolveFileHandle(path, options?.mode ?? 'read');
  }

  normalizeResourcePath(path: string): string {
    if (path.startsWith(this.resourcePrefix)) {
      return path.slice(this.resourcePrefix.length);
    }
    return path;
  }

  private getDefaultDirectoryPicker(): () => Promise<FileSystemDirectoryHandle> {
    return async () => {
      const globalWindow =
        typeof window === 'undefined'
          ? undefined
          : (window as Window &
              typeof globalThis & {
                showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
              });

      const picker = globalWindow?.showDirectoryPicker;
      if (typeof picker !== 'function') {
        throw new FileSystemAPIError(
          'unsupported',
          'showDirectoryPicker is not available in this environment.'
        );
      }
      return await picker.call(globalWindow);
    };
  }

  private async resolveFileHandle(
    path: string,
    mode: PermissionMode
  ): Promise<FileSystemFileHandle> {
    const directory = await this.resolveDirectoryHandle(this.getDirectoryPart(path), mode);
    const fileName = this.getFileName(path);

    try {
      const handle = await directory.getFileHandle(fileName);
      await this.ensurePermission(handle, mode);
      return handle;
    } catch (error) {
      throw this.normalizeResolutionError(error, path, 'file');
    }
  }

  private async resolveDirectoryHandle(
    path: string,
    mode: PermissionMode
  ): Promise<FileSystemDirectoryHandle> {
    const normalizedPath = this.normalizeResourcePath(path);
    const segments = this.splitPath(normalizedPath).filter(segment => segment.length > 0);

    const root = this.directoryHandle;
    if (!root) {
      throw new FileSystemAPIError('not-initialized', 'Project directory has not been set.');
    }

    let current: FileSystemDirectoryHandle = root;
    await this.ensurePermission(current, mode);

    for (const segment of segments) {
      try {
        current = await current.getDirectoryHandle(segment);
        await this.ensurePermission(current, mode);
      } catch (error) {
        throw this.normalizeResolutionError(error, path, 'directory');
      }
    }

    return current;
  }

  private splitPath(path: string): string[] {
    return path
      .replace(/^[\\/]+/, '')
      .replace(/\\+/g, '/')
      .split('/')
      .filter(segment => segment.length > 0 && segment !== '.');
  }

  private getDirectoryPart(path: string): string {
    const normalizedPath = this.normalizeResourcePath(path);
    const segments = this.splitPath(normalizedPath);
    return segments.slice(0, -1).join('/') || '.';
  }

  private getFileName(path: string): string {
    const normalizedPath = this.normalizeResourcePath(path);
    const segments = this.splitPath(normalizedPath);
    if (!segments.length) {
      throw new FileSystemAPIError('invalid-path', 'File path must include a file name.');
    }
    return segments[segments.length - 1];
  }

  private joinPath(base: string, name: string): string {
    if (base === '.' || base === '') {
      return name;
    }
    return `${base.replace(/\\+/g, '/').replace(/\/$/, '')}/${name}`;
  }

  private normalizeError(error: unknown, message: string): FileSystemAPIError {
    if (error instanceof FileSystemAPIError) {
      return error;
    }

    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        return new FileSystemAPIError('permission-denied', message, error);
      }
      if (error.name === 'NotFoundError') {
        return new FileSystemAPIError('not-found', message, error);
      }
    }

    this.logger?.(message, error);
    return new FileSystemAPIError('unknown', message, error);
  }

  private normalizeResolutionError(
    error: unknown,
    path: string,
    type: 'file' | 'directory'
  ): FileSystemAPIError {
    const message = `Unable to resolve ${type} at ${path}`;
    const normalized = this.normalizeError(error, message);
    if (normalized.code === 'unknown') {
      return new FileSystemAPIError('not-found', message, error);
    }
    return normalized;
  }

  /**
   * Create a directory at the given project-relative path. The path may be nested.
   * Example: 'assets/levels/newFolder'
   */
  async createDirectory(path: string): Promise<void> {
    try {
      const parentPath = this.getDirectoryPart(path);
      const dirName = this.getFileName(path);
      const parentHandle = await this.resolveDirectoryHandle(parentPath, 'readwrite');
      await parentHandle.getDirectoryHandle(dirName, { create: true });
    } catch (error) {
      throw this.normalizeError(error, `Failed to create directory at ${path}`);
    }
  }

  async writeTextFile(path: string, contents: string): Promise<void> {
    try {
      const directory = await this.resolveDirectoryHandle(this.getDirectoryPart(path), 'readwrite');
      const fileName = this.getFileName(path);
      const handle = await directory.getFileHandle(fileName, { create: true });
      await this.ensurePermission(handle, 'readwrite');
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    } catch (error) {
      throw this.normalizeError(error, `Failed to write file at ${path}`);
    }
  }

  /**
   * Check if a fileHandle is within the project directory.
   * Uses isSameEntry API if available to verify containment.
   */
  async isHandleInProject(fileHandle: FileSystemFileHandle): Promise<boolean> {
    try {
      if (!this.directoryHandle) {
        return false;
      }

      const projectDirWithEntries = this.directoryHandle as FileSystemDirectoryHandle & {
        resolve?: (handle: FileSystemHandle) => Promise<string[]>;
      };

      if (projectDirWithEntries.resolve) {
        try {
          // resolve() returns the path from project root to the file
          const pathSegments = await projectDirWithEntries.resolve(fileHandle);
          console.debug('[FileSystemAPIService] File is within project', {
            pathSegments,
            isInProject: pathSegments && pathSegments.length > 0,
          });
          return !!(pathSegments && pathSegments.length > 0);
        } catch (error) {
          // resolve not supported or file is outside project
          console.debug('[FileSystemAPIService] Unable to resolve file path relative to project', { error });
          return false;
        }
      }

      return false;
    } catch (error) {
      console.debug('[FileSystemAPIService] Error checking if handle is in project', { error });
      return false;
    }
  }
}

export const resolveFileSystemAPIService = (): FileSystemAPIService => {
  return ServiceContainer.getInstance().getService(
    ServiceContainer.getInstance().getOrCreateToken(FileSystemAPIService)
  ) as FileSystemAPIService;
};
