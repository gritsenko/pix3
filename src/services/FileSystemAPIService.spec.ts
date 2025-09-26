import { describe, expect, it, beforeEach } from 'vitest';

import { FileSystemAPIService, type FileSystemAPIServiceOptions } from './FileSystemAPIService';

type PermissionState = 'prompt' | 'granted' | 'denied';

class MemoryHandle {
	readonly kind: FileSystemHandleKind;
	readonly name: string;
	private permissionState: PermissionState;
	private requestResult: PermissionState | null = null;

	constructor(kind: FileSystemHandleKind, name: string, permission: PermissionState = 'granted') {
		this.kind = kind;
		this.name = name;
		this.permissionState = permission;
	}

	setPermission(state: PermissionState): void {
		this.permissionState = state;
	}

	setRequestResult(state: PermissionState): void {
		this.requestResult = state;
	}

	async queryPermission(): Promise<PermissionState> {
		return this.permissionState;
	}

	async requestPermission(): Promise<PermissionState> {
		if (this.requestResult) {
			this.permissionState = this.requestResult;
			return this.requestResult;
		}

		if (this.permissionState === 'prompt') {
			this.permissionState = 'granted';
		}

		return this.permissionState;
	}

	async isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return (this as unknown) === other;
	}
}

class MemoryFileHandle extends MemoryHandle {
	private contents: string;

	constructor(name: string, contents: string, permission: PermissionState = 'granted') {
		super('file', name, permission);
		this.contents = contents;
	}

	setContents(contents: string): void {
		this.contents = contents;
	}

	async getFile(): Promise<File> {
		const fileLike = {
			name: this.name,
			lastModified: Date.now(),
			webkitRelativePath: '',
			type: 'text/plain',
			arrayBuffer: async () => new TextEncoder().encode(this.contents).buffer,
			stream: () => new ReadableStream<Uint8Array>(),
			slice: () => new Blob([this.contents]),
			text: async () => this.contents,
		} as unknown as File;
		return fileLike;
	}

	async createWritable(): Promise<FileSystemWritableFileStream> {
		throw new Error('Not implemented');
	}
}

class MemoryDirectoryHandle extends MemoryHandle {
	private readonly entriesMap = new Map<string, MemoryHandle>();

	constructor(name: string, permission: PermissionState = 'granted') {
		super('directory', name, permission);
	}

	addEntry(handle: MemoryHandle): void {
		this.entriesMap.set(handle.name, handle);
	}

	async getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle> {
		const handle = this.entriesMap.get(name);
		if (handle && handle.kind === 'directory') {
			return handle as unknown as FileSystemDirectoryHandle;
		}
		throw createNotFoundError(name);
	}

	async getFileHandle(name: string): Promise<FileSystemFileHandle> {
		const handle = this.entriesMap.get(name);
		if (handle && handle.kind === 'file') {
			return handle as unknown as FileSystemFileHandle;
		}
		throw createNotFoundError(name);
	}

	async removeEntry(): Promise<void> {
		throw new Error('Not implemented');
	}

	async resolve(): Promise<string[]> {
		return [];
	}

	async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
		for (const [name, handle] of this.entriesMap.entries()) {
			yield [name, handle as unknown as FileSystemHandle];
		}
	}

	async *values(): AsyncIterableIterator<FileSystemHandle & { name?: string }> {
		for (const handle of this.entriesMap.values()) {
			yield handle as unknown as FileSystemHandle & { name?: string };
		}
	}
}

const createNotFoundError = (name: string): DOMException => {
	if (typeof DOMException !== 'undefined') {
		return new DOMException(`${name} not found`, 'NotFoundError');
	}

	class DOMExceptionPolyfill extends Error {
		readonly name: string;

		constructor(message: string, name: string) {
			super(message);
			this.name = name;
		}
	}

	return new DOMExceptionPolyfill(`${name} not found`, 'NotFoundError') as unknown as DOMException;
};

describe('FileSystemAPIService', () => {
	let root: MemoryDirectoryHandle;
	let service: FileSystemAPIService;
	let options: FileSystemAPIServiceOptions;

	beforeEach(() => {
		root = new MemoryDirectoryHandle('project');
		const scenes = new MemoryDirectoryHandle('scenes');
		const assets = new MemoryDirectoryHandle('assets');
		const sceneFile = new MemoryFileHandle('level-1.pix3scene', 'version: 1\nname: Level 1');
		const textFile = new MemoryFileHandle('readme.txt', 'Hello Pix3');
		scenes.addEntry(sceneFile);
		root.addEntry(scenes);
		root.addEntry(assets);
		root.addEntry(textFile);

		options = {
			directoryPicker: () => Promise.resolve(root as unknown as FileSystemDirectoryHandle),
		};

		service = new FileSystemAPIService(options);
	});

	it('requests project directory and stores the handle', async () => {
		const handle = await service.requestProjectDirectory();
		expect(handle.name).toBe('project');
		expect(service.getProjectDirectory()).toBe(handle);
	});

	it('reads text files relative to the project root', async () => {
		await service.requestProjectDirectory();
		const contents = await service.readTextFile('readme.txt');
		expect(contents).toBe('Hello Pix3');
	});

	it('parses YAML scenes using readScene', async () => {
		await service.requestProjectDirectory();
		const result = await service.readScene('scenes/level-1.pix3scene');
		expect(result.scene).toMatchObject({ version: 1, name: 'Level 1' });
		expect(result.raw).toContain('version');
	});

	it('lists directory entries with relative paths', async () => {
		await service.requestProjectDirectory();
		const entries = await service.listDirectory('.');
		const names = entries.map((entry) => entry.name).sort();
		expect(names).toEqual(['assets', 'readme.txt', 'scenes']);
	});

	it('throws a permission error when access is denied', async () => {
		root.setPermission('prompt');
		root.setRequestResult('denied');
		await expect(service.requestProjectDirectory()).rejects.toMatchObject({ code: 'permission-denied' });
	});
});
