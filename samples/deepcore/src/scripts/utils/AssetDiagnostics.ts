import * as THREE from 'three';
import { useGameStore } from '../core/GameStore';

interface ModelInfo {
    type: string;
    path: string;
    vertices: number;
    triangles: number;
    geometrySize: number;
    loadTime: number;
    loadedAt: number;
}

interface TextureInfo {
    key: string;
    path: string;
    width: number;
    height: number;
    format: string;
    fileSize: number;
    inMemorySize: number;
    loadTime: number;
    loadedAt: number;
}

interface LoadingCounters {
    modelsTotal: number;
    modelsLoaded: number;
    modelsFailed: number;
    texturesTotal: number;
    texturesLoaded: number;
    texturesFailed: number;
    totalLoadTime: number;
    startTime: number;
}

// Legacy RGB texture format numeric value retained for diagnostics compatibility
// across Three.js versions where RGBFormat was removed from the type surface.
const LEGACY_RGB_FORMAT = 1022;

export class AssetDiagnostics {
    private static instance: AssetDiagnostics;
    private models: Map<string, ModelInfo> = new Map();
    private textures: Map<string, TextureInfo> = new Map();
    private counters: LoadingCounters = {
        modelsTotal: 0,
        modelsLoaded: 0,
        modelsFailed: 0,
        texturesTotal: 0,
        texturesLoaded: 0,
        texturesFailed: 0,
        totalLoadTime: 0,
        startTime: 0,
    };

    private constructor() {
        this.counters.startTime = performance.now();
    }

    public static getInstance(): AssetDiagnostics {
        if (!AssetDiagnostics.instance) {
            AssetDiagnostics.instance = new AssetDiagnostics();
        }
        return AssetDiagnostics.instance;
    }

    public isDebugMode(): boolean {
        try {
            return useGameStore.getState().debugMode;
        } catch {
            return false;
        }
    }

    public reset(): void {
        this.models.clear();
        this.textures.clear();
        this.counters = {
            modelsTotal: 0,
            modelsLoaded: 0,
            modelsFailed: 0,
            texturesTotal: 0,
            texturesLoaded: 0,
            texturesFailed: 0,
            totalLoadTime: 0,
            startTime: performance.now(),
        };
    }

    public trackModelStart(_type: string, _path: string): void {
        if (!this.isDebugMode()) return;
        this.counters.modelsTotal++;
    }

    public trackModelLoaded(
        type: string,
        path: string,
        geometry: THREE.BufferGeometry,
        loadTime: number
    ): void {
        if (!this.isDebugMode()) return;

        this.counters.modelsLoaded++;
        this.counters.totalLoadTime += loadTime;

        // Get base geometry triangle count (not multiplied by instances)
        const vertices = geometry.attributes.position?.count || 0;
        const triangles = Math.floor(vertices / 3);

        let sizeBytes = 0;
        if (geometry.index) {
            const indexType = geometry.index.array.constructor.name;
            const bytesPerElement = this.getBytesForType(indexType);
            sizeBytes += geometry.index.count * bytesPerElement;
        }
        for (const attr of Object.values(geometry.attributes)) {
            const attrType = attr.array.constructor.name;
            const bytesPerElement = this.getBytesForType(attrType);
            sizeBytes += attr.count * bytesPerElement;
        }

        this.models.set(type, {
            type,
            path,
            vertices,
            triangles,
            geometrySize: sizeBytes,
            loadTime,
            loadedAt: performance.now() - this.counters.startTime,
        });
    }

    public debugGeometry(geometry: THREE.BufferGeometry, label: string): void {
        if (!this.isDebugMode()) return;
        const vertices = geometry.attributes.position?.count || 0;
        const triangles = Math.floor(vertices / 3);
        console.log(`[${label}] Vertices: ${vertices}, Triangles: ${triangles}, Index: ${geometry.index?.count || 'none'}`);
    }

    private getBytesForType(typeName: string): number {
        const typeMap: Record<string, number> = {
            'Float32Array': 4,
            'Int32Array': 4,
            'Uint32Array': 4,
            'Uint16Array': 2,
            'Int16Array': 2,
            'Uint8Array': 1,
            'Int8Array': 1,
        };
        return typeMap[typeName] || 4;
    }

    public trackModelFailed(_type: string, _path: string): void {
        if (!this.isDebugMode()) return;
        this.counters.modelsFailed++;
    }

    public trackTextureStart(_key: string, _path: string): void {
        if (!this.isDebugMode()) return;
        this.counters.texturesTotal++;
    }

    public trackTextureLoaded(
        key: string,
        path: string,
        texture: THREE.Texture,
        fileSize: number,
        loadTime: number
    ): void {
        if (!this.isDebugMode()) return;

        this.counters.texturesLoaded++;
        this.counters.totalLoadTime += loadTime;

        const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
        const width = image?.width || 0;
        const height = image?.height || 0;
        const format = this.getTextureFormat(texture.format);
        const inMemorySize = this.calculateTextureMemorySize(texture);

        this.textures.set(key, {
            key,
            path,
            width,
            height,
            format,
            fileSize,
            inMemorySize,
            loadTime,
            loadedAt: performance.now() - this.counters.startTime,
        });
    }

    public trackTextureFailed(_key: string, _path: string): void {
        if (!this.isDebugMode()) return;
        this.counters.texturesFailed++;
    }

    private getTextureFormat(format: number): string {
        const formatMap: Record<number, string> = {
            [THREE.RedFormat]: 'Red',
            [THREE.RedIntegerFormat]: 'RedInteger',
            [THREE.RGFormat]: 'RG',
            [THREE.RGIntegerFormat]: 'RGInteger',
            [LEGACY_RGB_FORMAT]: 'RGB',
            [THREE.RGBAFormat]: 'RGBA',
            [THREE.RGBAIntegerFormat]: 'RGBAInteger',
        };
        return formatMap[format] || `Unknown(${format})`;
    }

    private calculateTextureMemorySize(texture: THREE.Texture): number {
        const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
        const width = image?.width || 0;
        const height = image?.height || 0;
        const pixels = width * height;
        const bytesPerPixel = this.getBytesPerPixel(texture.format);
        return pixels * bytesPerPixel;
    }

    private getBytesPerPixel(format: number): number {
        const formatMap: Record<number, number> = {
            [THREE.RedFormat]: 1,
            [THREE.RedIntegerFormat]: 1,
            [THREE.RGFormat]: 2,
            [THREE.RGIntegerFormat]: 2,
            [LEGACY_RGB_FORMAT]: 3,
            [THREE.RGBAFormat]: 4,
            [THREE.RGBAIntegerFormat]: 4,
        };
        return formatMap[format] || 4;
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    private formatMs(ms: number): string {
        if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`;
        if (ms < 1000) return `${ms.toFixed(2)} ms`;
        return `${(ms / 1000).toFixed(2)} s`;
    }

    public logReport(): void {
        if (!this.isDebugMode()) return;

        const totalTime = performance.now() - this.counters.startTime;

        console.group('📊 Asset Loading Diagnostics Report');
        console.log(`%c⏱️  Total Load Time: ${this.formatMs(totalTime)}`, 'color: cyan; font-weight: bold');

        console.group('📦 Loading Counters');
        console.log(`Models: ${this.counters.modelsLoaded}/${this.counters.modelsTotal} loaded, ${this.counters.modelsFailed} failed`);
        console.log(`Textures: ${this.counters.texturesLoaded}/${this.counters.texturesTotal} loaded, ${this.counters.texturesFailed} failed`);
        console.log(`Average load time: ${this.formatMs(this.counters.totalLoadTime / Math.max(1, this.counters.modelsLoaded + this.counters.texturesLoaded))}`);
        console.groupEnd();

        if (this.models.size > 0) {
            console.group('🔷 Models (sorted by triangle count)');
            const sortedModels = Array.from(this.models.values()).sort((a, b) => b.triangles - a.triangles);

            const tableData = sortedModels.map((m) => ({
                Type: m.type,
                Path: m.path.split('/').pop() || m.path,
                Triangles: m.triangles.toLocaleString(),
                Vertices: m.vertices.toLocaleString(),
                'Size (KB)': this.formatBytes(m.geometrySize),
                'Load Time': this.formatMs(m.loadTime),
            }));
            console.table(tableData);

            let totalTriangles = 0;
            let totalSize = 0;
            sortedModels.forEach((m) => {
                totalTriangles += m.triangles;
                totalSize += m.geometrySize;
            });
            console.log(`Total: ${totalTriangles.toLocaleString()} triangles, ${this.formatBytes(totalSize)}`);
            console.groupEnd();
        }

        if (this.textures.size > 0) {
            console.group('🖼️ Textures (sorted by in-memory size)');
            const sortedTextures = Array.from(this.textures.values()).sort((a, b) => b.inMemorySize - a.inMemorySize);

            const tableData = sortedTextures.map((t) => ({
                Key: t.key,
                Path: t.path.split('/').pop() || t.path,
                Dimensions: `${t.width}×${t.height}`,
                Format: t.format,
                'File Size': this.formatBytes(t.fileSize || 0),
                'Memory Size': this.formatBytes(t.inMemorySize),
                'Load Time': this.formatMs(t.loadTime),
            }));
            console.table(tableData);

            let totalFileSize = 0;
            let totalMemorySize = 0;
            sortedTextures.forEach((t) => {
                totalFileSize += t.fileSize || 0;
                totalMemorySize += t.inMemorySize;
            });
            console.log(`Total file size: ${this.formatBytes(totalFileSize)}`);
            console.log(`Total memory size: ${this.formatBytes(totalMemorySize)}`);
            if (totalFileSize > 0) {
                console.log(`Memory overhead: ${((totalMemorySize / totalFileSize - 1) * 100).toFixed(1)}%`);
            } else {
                console.log('Memory overhead: N/A (Embedded or Generated bits)');
            }
            console.groupEnd();
        }

        if (this.counters.modelsFailed > 0) {
            console.group('❌ Failed Model Loads');
            for (const [type, info] of this.models) {
                if (info.triangles === 0 && info.geometrySize === 0) {
                    console.log(`Type ${type}: ${info.path}`);
                }
            }
            console.groupEnd();
        }

        if (this.counters.texturesFailed > 0) {
            console.group('❌ Failed Texture Loads');
            for (const [key, info] of this.textures) {
                if (info.width === 0 && info.height === 0) {
                    console.log(`Key "${key}": ${info.path}`);
                }
            }
            console.groupEnd();
        }

        console.groupEnd();
    }

    public getModelInfo(): ModelInfo[] {
        return Array.from(this.models.values()).sort((a, b) => b.triangles - a.triangles);
    }

    public getTextureInfo(): TextureInfo[] {
        return Array.from(this.textures.values()).sort((a, b) => b.inMemorySize - a.inMemorySize);
    }

    public getCounters(): LoadingCounters {
        return { ...this.counters };
    }
}

export const assetDiagnostics = AssetDiagnostics.getInstance();
