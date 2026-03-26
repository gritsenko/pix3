import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { ResourceManager } from '@pix3/runtime';
import { BlockType, BLOCK_PROPERTIES } from '../core/Types';
import { assetDiagnostics } from '../utils/AssetDiagnostics';
import { botConfig } from '../config/bot';
import { WALL_PLANES } from '../config';
import { createBlockMaterial } from './BlockShader';
import { TEXTURES } from '../../assets/textures';

export interface BlockRenderResources {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
}

// Debug flag - set to false in production to disable verbose model loading logs
const DEBUG_MODELS = import.meta.env.DEV;

export class ModelManager {
    private static instance: ModelManager;
    private readonly geometries: Map<BlockType, THREE.BufferGeometry> = new Map();
    private readonly textures: Map<BlockType, THREE.Texture> = new Map();
    private readonly sourceMaterials: Map<BlockType, THREE.Material> = new Map();
    private readonly materials: Map<BlockType, THREE.Material> = new Map();
    private colormapTexture: THREE.Texture | null = null;
    private botModel: THREE.Group | null = null;
    private wallGeometry: THREE.BufferGeometry | null = null;
    private wallTexture: THREE.Texture | null = null;
    private readonly loader: GLTFLoader;
    private readonly textureLoader: THREE.TextureLoader;
    private readonly defaultGeometry: THREE.BoxGeometry;
    private readonly textureCache: Map<string, THREE.Texture> = new Map();
    private readonly textureLoadInFlight: Map<string, Promise<THREE.Texture>> = new Map();
    private loadingPromise: Promise<void> | null = null;
    private readonly listeners: Array<() => void> = [];
    private resourceManager: ResourceManager | null = null;

    private constructor() {
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        const dracoLoader = new DRACOLoader();
        const baseUrl = import.meta.env.BASE_URL || './';
        const dracoPath = baseUrl.endsWith('/') ? `${baseUrl}draco/` : `${baseUrl}/draco/`;
        dracoLoader.setDecoderPath(dracoPath);
        this.loader.setDRACOLoader(dracoLoader);

        this.defaultGeometry = new THREE.BoxGeometry(1, 1, 1);
    }

    public static getInstance(): ModelManager {
        if (!ModelManager.instance) {
            ModelManager.instance = new ModelManager();
        }
        return ModelManager.instance;
    }

    public setResourceManager(resourceManager: ResourceManager): void {
        this.resourceManager = resourceManager;
    }

    public async loadAll(): Promise<void> {
        if (this.loadingPromise) return this.loadingPromise;

        const loads: Array<Promise<void>> = [];

        loads.push(this.loadTextureResource(TEXTURES.colormap).then((texture) => {
          this.colormapTexture = texture;
          if (DEBUG_MODELS) console.log('[ModelManager] Loaded shared colormap');
        }).catch((error: unknown) => {
          console.error('[ModelManager] Failed to load colormap:', error);
        }));

        for (const key of Object.keys(BLOCK_PROPERTIES)) {
            const type = Number(key) as BlockType;
            const props = BLOCK_PROPERTIES[type];
            if (!props.modelPath) {
                continue;
            }

            const startTime = performance.now();
            assetDiagnostics.trackModelStart(type.toString(), props.modelPath);
            loads.push(
                this.loadGltfFromResource(props.modelPath)
                    .then((gltf) => this.applyBlockModel(type, props.modelPath!, gltf, startTime))
                    .catch((error: unknown) => {
                        assetDiagnostics.trackModelFailed(type.toString(), props.modelPath!);
                        console.error(`Failed to load model for block type ${type}:`, error);
                    })
            );
        }

        if (botConfig.visual.modelPath) {
            const startTime = performance.now();
            assetDiagnostics.trackModelStart('bot', botConfig.visual.modelPath);
            loads.push(
                this.loadGltfFromResource(botConfig.visual.modelPath)
                    .then((gltf) => this.applyBotModel(botConfig.visual.modelPath, gltf, startTime))
                    .catch((error: unknown) => {
                        assetDiagnostics.trackModelFailed('bot', botConfig.visual.modelPath);
                        console.error('[ModelManager] Failed to load bot model:', error);
                    })
            );
        }

        if (WALL_PLANES.modelPath) {
            const startTime = performance.now();
            assetDiagnostics.trackModelStart('wall', WALL_PLANES.modelPath);
            loads.push(
                this.loadGltfFromResource(WALL_PLANES.modelPath)
                    .then((gltf) => this.applyWallModel(WALL_PLANES.modelPath, gltf, startTime))
                    .catch((error: unknown) => {
                        assetDiagnostics.trackModelFailed('wall', WALL_PLANES.modelPath);
                        console.error('[ModelManager] Failed to load wall model:', error);
                    })
            );
        }

        this.loadingPromise = Promise.all(loads).then(() => {
            assetDiagnostics.logReport();
            this.notifyListeners();
        });

        return this.loadingPromise;
    }

    public getBotModel(): THREE.Group | null {
        return this.botModel ? this.botModel.clone() : null;
    }

    public getWallGeometry(): THREE.BufferGeometry | null {
        return this.wallGeometry;
    }

    public getWallTexture(): THREE.Texture | null {
        return this.wallTexture;
    }

    public getColormap(): THREE.Texture | null {
        return this.colormapTexture;
    }

    public getGeometry(type: BlockType): THREE.BufferGeometry {
        return this.geometries.get(type) || this.defaultGeometry;
    }

    public getTexture(type: BlockType): THREE.Texture | undefined {
        return this.textures.get(type);
    }

    public createBlockRenderResources(type: BlockType): BlockRenderResources {
        const props = BLOCK_PROPERTIES[type];
        const sourceMaterial = this.sourceMaterials.get(type);

        const texture = props.modelPath
            ? this.getTexture(type) || this.colormapTexture || undefined
            : undefined;
        const baseColor = sourceMaterial && 'color' in sourceMaterial
            ? ((sourceMaterial as THREE.MeshStandardMaterial).color?.getHex?.() ?? 0xffffff)
            : texture ? 0xffffff : props.color;

        const geometry = this.getGeometry(type).clone();
        geometry.userData = { ...geometry.userData, isInstancedClone: true };
        geometry.computeBoundingBox();

        const bounds = geometry.boundingBox || new THREE.Box3(
            new THREE.Vector3(-0.5, -0.5, -0.5),
            new THREE.Vector3(0.5, 0.5, 0.5)
        );

        const material = createBlockMaterial(baseColor, texture, bounds, sourceMaterial);

        return { geometry, material };
    }

    public getMaterial(type: BlockType): THREE.Material {
        let material = this.materials.get(type);
        if (!material) {
            const props = BLOCK_PROPERTIES[type];
            const sourceMaterial = this.sourceMaterials.get(type);
            const texture = props.modelPath ? this.getTexture(type) || this.colormapTexture || undefined : undefined;
            const baseColor = sourceMaterial && 'color' in sourceMaterial
                ? ((sourceMaterial as THREE.MeshStandardMaterial).color?.getHex?.() ?? 0xffffff)
                : texture ? 0xffffff : props.color;

            material = createBlockMaterial(baseColor, texture, undefined, sourceMaterial);
            this.materials.set(type, material);
        }
        return material;
    }

    public onModelsLoaded(callback: () => void): void {
        this.listeners.push(callback);
    }

    public dispose(): void {
        for (const geometry of this.geometries.values()) {
            geometry.dispose();
        }
        for (const texture of this.textures.values()) {
            texture.dispose();
        }
        for (const texture of this.textureCache.values()) {
            texture.dispose();
        }
        this.colormapTexture?.dispose();
        this.wallTexture?.dispose();
        this.geometries.clear();
        this.textures.clear();
        this.textureCache.clear();
        this.sourceMaterials.clear();
        this.materials.clear();
        this.textureLoadInFlight.clear();
        this.botModel = null;
        this.wallGeometry = null;
        this.wallTexture = null;
        this.colormapTexture = null;
        this.loadingPromise = null;
    }

    private async loadGltfFromResource(resourcePath: string): Promise<GLTF> {
        const blob = await this.readBlob(resourcePath);
        const arrayBuffer = await blob.arrayBuffer();

        return await new Promise<GLTF>((resolve, reject) => {
            this.loader.parse(
                arrayBuffer,
                '',
                (gltf: GLTF) => resolve(gltf),
                (error: unknown) => reject(error)
            );
        });
    }

    private async loadTextureResource(resourcePath: string): Promise<THREE.Texture> {
        const cachedTexture = this.textureCache.get(resourcePath);
        if (cachedTexture) {
            return cachedTexture;
        }

        const inFlight = this.textureLoadInFlight.get(resourcePath);
        if (inFlight) {
            return inFlight;
        }

        const loadPromise = (async (): Promise<THREE.Texture> => {
            const blob = await this.readBlob(resourcePath);
            const objectUrl = URL.createObjectURL(blob);

            try {
                const texture = await new Promise<THREE.Texture>((resolve, reject) => {
                    this.textureLoader.load(
                        objectUrl,
                        (texture) => {
                            texture.colorSpace = THREE.SRGBColorSpace;
                            texture.magFilter = THREE.LinearFilter;
                            texture.minFilter = THREE.LinearFilter;
                            resolve(texture);
                        },
                        undefined,
                        (error: unknown) => reject(error)
                    );
                });

                this.textureCache.set(resourcePath, texture);
                return texture;
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        })();

        this.textureLoadInFlight.set(resourcePath, loadPromise);
        loadPromise.finally(() => {
            this.textureLoadInFlight.delete(resourcePath);
        });

        return loadPromise;
    }

    private async applyBlockModel(
        type: BlockType,
        modelPath: string,
        gltf: GLTF,
        startTime: number
    ): Promise<void> {
        let mesh: THREE.Mesh | undefined;
        gltf.scene.traverse((child: THREE.Object3D) => {
            if (!mesh && child instanceof THREE.Mesh) {
                mesh = child;
            }
        });

        if (!mesh) {
            console.warn(`[ModelManager] No mesh found in block model ${modelPath}`);
            return;
        }

        const geometry = mesh.geometry.clone();
        const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

        if (DEBUG_MODELS) {
            const verticesAfter = geometry.attributes.position?.count || 0;
            console.log(`[ModelLoad] ${modelPath}: ${Math.floor(verticesAfter / 3)} triangles`);
        }

        const loadTime = performance.now() - startTime;
        assetDiagnostics.trackModelLoaded(type.toString(), modelPath, geometry, loadTime);

        const scale = BLOCK_PROPERTIES[type].scale;
        if (typeof scale === 'number') {
            geometry.scale(scale, scale, scale);
        }

        this.geometries.set(type, geometry);
        if (sourceMaterial instanceof THREE.Material) {
            this.sourceMaterials.set(type, sourceMaterial.clone());
        }

        const mappedMaterial = sourceMaterial as (THREE.Material & { map?: THREE.Texture | null }) | null;
        if (mappedMaterial?.map) {
            this.textures.set(type, mappedMaterial.map);
            assetDiagnostics.trackTextureStart(`block_${type}`, modelPath);
            assetDiagnostics.trackTextureLoaded(`block_${type}`, modelPath, mappedMaterial.map, 0, loadTime);
        }

        if (DEBUG_MODELS) console.log(`Loaded model for block type ${type}`);
    }

    private async applyBotModel(modelPath: string, gltf: GLTF, startTime: number): Promise<void> {
        this.botModel = gltf.scene;

        let mesh: THREE.Mesh | undefined;
        gltf.scene.traverse((child: THREE.Object3D) => {
            if (!mesh && child instanceof THREE.Mesh) {
                mesh = child;
            }
        });

        if (mesh) {
            assetDiagnostics.trackModelLoaded('bot', modelPath, mesh.geometry, performance.now() - startTime);
        }

        const scale = botConfig.visual.scale;
        this.botModel.scale.set(scale, scale, scale);
        if (DEBUG_MODELS) console.log('[ModelManager] Bot model loaded from', modelPath);
    }

    private async applyWallModel(modelPath: string, gltf: GLTF, startTime: number): Promise<void> {
        let mesh: THREE.Mesh | undefined;
        gltf.scene.traverse((child: THREE.Object3D) => {
            if (!mesh && child instanceof THREE.Mesh) {
                mesh = child;
            }
        });

        if (!mesh) {
            console.warn(`[ModelManager] No mesh found in wall model ${modelPath}`);
            return;
        }

        assetDiagnostics.trackModelLoaded('wall', modelPath, mesh.geometry, performance.now() - startTime);
        this.wallGeometry = mesh.geometry.clone();

        const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const mappedMaterial = sourceMaterial as (THREE.Material & { map?: THREE.Texture | null }) | null;
        if (mappedMaterial?.map) {
            this.wallTexture = mappedMaterial.map;
            assetDiagnostics.trackTextureStart('wall_texture', modelPath);
            assetDiagnostics.trackTextureLoaded(
                'wall_texture',
                modelPath,
                mappedMaterial.map,
                0,
                performance.now() - startTime
            );
        }

        if (DEBUG_MODELS) console.log('[ModelManager] Wall model loaded from', modelPath);
    }

    private async readBlob(resourcePath: string): Promise<Blob> {
        if (this.resourceManager) {
            return await this.resourceManager.readBlob(resourcePath);
        }

        const response = await fetch(resourcePath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} while fetching ${resourcePath}`);
        }
        return await response.blob();
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
