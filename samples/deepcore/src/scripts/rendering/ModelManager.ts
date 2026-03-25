import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { BlockType, BLOCK_PROPERTIES } from '../core/Types';
import { assetDiagnostics } from '../utils/AssetDiagnostics';
import { botConfig } from '../config/bot';
import { WALL_PLANES } from '../config';
import { createBlockMaterial } from './BlockShader';
import colormapUrl from '../assets/models/colormap.png?url';

export interface BlockRenderResources {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
}

// Debug flag - set to false in production to disable verbose model loading logs
const DEBUG_MODELS = import.meta.env.DEV;

export class ModelManager {
    private static instance: ModelManager;
    private geometries: Map<BlockType, THREE.BufferGeometry> = new Map();
    private textures: Map<BlockType, THREE.Texture> = new Map();
    private sourceMaterials: Map<BlockType, THREE.Material> = new Map();
    // private materialCache: Map<string, THREE.Material> = new Map(); // Removed unused
    private materials: Map<BlockType, THREE.Material> = new Map(); // Keep this for compatibility
    private colormapTexture: THREE.Texture | null = null;
    private botModel: THREE.Group | null = null;
    private wallGeometry: THREE.BufferGeometry | null = null;
    private wallTexture: THREE.Texture | null = null;
    private loader: GLTFLoader;
    private defaultGeometry: THREE.BoxGeometry;
    private loadingPromise: Promise<void> | null = null;
    private listeners: (() => void)[] = [];

    private constructor() {
        this.loader = new GLTFLoader();

        // Setup DRACO decoder to support Draco-compressed GLTF models
        const dracoLoader = new DRACOLoader();
        // Use local decoder files (served from /public/draco) to avoid remote 404s/CORS issues
        // Use Vite base URL so files load correctly when site is hosted on a subpath
        const baseUrl = import.meta.env.BASE_URL || './';
        const dracoPath = baseUrl.endsWith('/') ? baseUrl + 'draco/' : baseUrl + '/draco/';
        dracoLoader.setDecoderPath(dracoPath);
        // Prefer WASM decoder when available (default). If you need a JS-only fallback, set:
        // dracoLoader.setDecoderConfig({ type: 'js' });
        this.loader.setDRACOLoader(dracoLoader);

        this.defaultGeometry = new THREE.BoxGeometry(1, 1, 1);
    }

    public static getInstance(): ModelManager {
        if (!ModelManager.instance) {
            ModelManager.instance = new ModelManager();
        }
        return ModelManager.instance;
    }

    public loadAll(): Promise<void> {
        if (this.loadingPromise) return this.loadingPromise;

        const promises: Promise<void>[] = [];

        // Load shared colormap texture once
        const texturePromise = new Promise<void>((resolve) => {
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(colormapUrl, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.flipY = false; // Important for GLTF compatibility
                this.colormapTexture = texture;
                if (DEBUG_MODELS) console.log('[ModelManager] Loaded shared colormap');
                resolve();
            }, undefined, (err) => {
                console.error('[ModelManager] Failed to load colormap:', err);
                resolve();
            });
        });
        promises.push(texturePromise);

        // Iterate over all block types
        for (const key of Object.keys(BLOCK_PROPERTIES)) {
            const type = Number(key) as BlockType;
            const props = BLOCK_PROPERTIES[type];

            if (props.modelPath) {
                // Track model loading start
                const startTime = performance.now();
                assetDiagnostics.trackModelStart(type.toString(), props.modelPath);

                // Load model
                const p = new Promise<void>((resolve) => {
                    this.loader.load(
                        props.modelPath!,
                        (gltf: any) => {
                            // Debug: check if any mesh is an InstancedMesh
                            gltf.scene.traverse((child: THREE.Object3D) => {
                                if (child instanceof THREE.Mesh) {
                                    if (DEBUG_MODELS) {
                                        const isInstanced = (child as any).isInstancedMesh;
                                        const instanceCount = isInstanced ? (child as THREE.InstancedMesh).count : 1;
                                        console.log(`[ModelLoad] ${props.modelPath}: isInstancedMesh=${isInstanced}, instanceCount=${instanceCount}`);

                                        // Check geometry attributes
                                        const posAttr = child.geometry.attributes.position;
                                        if (posAttr) {
                                            console.log(`[ModelLoad] Geometry: ${posAttr.count} vertices, ${Math.floor(posAttr.count / 3)} triangles`);
                                        }
                                    }
                                }
                            });

                            // Find the first mesh
                            let mesh: THREE.Mesh | undefined;
                            gltf.scene.traverse((child: THREE.Object3D) => {
                                if (!mesh && child instanceof THREE.Mesh) {
                                    mesh = child;
                                }
                            });

                            if (mesh) {
                                const geometry = mesh.geometry.clone();
                                const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

                                if (DEBUG_MODELS) {
                                    const verticesAfter = geometry.attributes.position?.count || 0;
                                    console.log(`[ModelLoad] ${props.modelPath}: ${Math.floor(verticesAfter / 3)} triangles`);
                                }

                                const loadTime = performance.now() - startTime;

                                // Track model loaded
                                assetDiagnostics.trackModelLoaded(type.toString(), props.modelPath!, geometry, loadTime);

                                // Apply optional scale
                                if (props.scale) {
                                    geometry.scale(props.scale, props.scale, props.scale);
                                }

                                this.geometries.set(type, geometry);
                                if (sourceMaterial instanceof THREE.Material) {
                                    this.sourceMaterials.set(type, sourceMaterial.clone());
                                }

                                // Extract texture if available and track it
                                if (sourceMaterial) {
                                    const material = sourceMaterial as any;
                                    if (material.map) {
                                        this.textures.set(type, material.map);
                                        assetDiagnostics.trackTextureStart(`block_${type}`, props.modelPath!);
                                        assetDiagnostics.trackTextureLoaded(
                                            `block_${type}`,
                                            props.modelPath!,
                                            material.map,
                                            0,
                                            loadTime
                                        );
                                    }
                                }

                                if (DEBUG_MODELS) console.log(`Loaded model for block type ${type}`);
                            }
                            resolve();
                        },
                        undefined,
                        (error: unknown) => {
                            // Track model failure
                            assetDiagnostics.trackModelFailed(type.toString(), props.modelPath!);
                            console.error(`Failed to load model for block type ${type}:`, error);
                            resolve();
                        }
                    );
                });
                promises.push(p);
            }
        }

        // Load bot model
        if (botConfig.visual.modelPath) {
            const startTime = performance.now();
            assetDiagnostics.trackModelStart('bot', botConfig.visual.modelPath);
            const p = new Promise<void>((resolve) => {
                this.loader.load(
                    botConfig.visual.modelPath,
                    (gltf) => {
                        this.botModel = gltf.scene;
                        
                        // Find first mesh for diagnostics
                        let mesh: THREE.Mesh | undefined;
                        gltf.scene.traverse((child: THREE.Object3D) => {
                            if (!mesh && child instanceof THREE.Mesh) mesh = child;
                        });
                        
                        if (mesh) {
                            assetDiagnostics.trackModelLoaded('bot', botConfig.visual.modelPath, mesh.geometry, performance.now() - startTime);
                        }

                        // Apply initial scale to the group so we don't have to scale everywhere
                        const scale = botConfig.visual.scale;
                        this.botModel.scale.set(scale, scale, scale);
                        if (DEBUG_MODELS) console.log('[ModelManager] Bot model loaded from', botConfig.visual.modelPath);
                        resolve();
                    },
                    undefined,
                    (err) => {
                        assetDiagnostics.trackModelFailed('bot', botConfig.visual.modelPath);
                        console.error('[ModelManager] Failed to load bot model:', err);
                        resolve();
                    }
                );
            });
            promises.push(p);
        }

        // Load wall model
        if (WALL_PLANES.modelPath) {
            const startTime = performance.now();
            assetDiagnostics.trackModelStart('wall', WALL_PLANES.modelPath);
            const p = new Promise<void>((resolve) => {
                this.loader.load(
                    WALL_PLANES.modelPath,
                    (gltf) => {
                        let mesh: THREE.Mesh | undefined;
                        gltf.scene.traverse((child: THREE.Object3D) => {
                            if (!mesh && child instanceof THREE.Mesh) {
                                mesh = child;
                            }
                        });

                        if (mesh) {
                            assetDiagnostics.trackModelLoaded('wall', WALL_PLANES.modelPath, mesh.geometry, performance.now() - startTime);
                            this.wallGeometry = mesh.geometry.clone();
                            if (mesh.material) {
                                const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as any;
                                if (material.map) {
                                    this.wallTexture = material.map;
                                    assetDiagnostics.trackTextureStart('wall_texture', WALL_PLANES.modelPath);
                                    assetDiagnostics.trackTextureLoaded(
                                        'wall_texture',
                                        WALL_PLANES.modelPath,
                                        material.map,
                                        0,
                                        performance.now() - startTime
                                    );
                                }
                            }
                            if (DEBUG_MODELS) console.log('[ModelManager] Wall model loaded from', WALL_PLANES.modelPath);
                        }
                        resolve();
                    },
                    undefined,
                    (err) => {
                        assetDiagnostics.trackModelFailed('wall', WALL_PLANES.modelPath);
                        console.error('[ModelManager] Failed to load wall model:', err);
                        resolve();
                    }
                );
            });
            promises.push(p);
        }

        this.loadingPromise = Promise.all(promises).then(() => {
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

    public onModelsLoaded(callback: () => void): void {
        this.listeners.push(callback);
    }

    /**
     * Get cached material for block type (creates if not cached)
     */
    public getMaterial(type: BlockType): THREE.Material {
        let material = this.materials.get(type);
        if (!material) {
            const props = BLOCK_PROPERTIES[type];
            const sourceMaterial = this.sourceMaterials.get(type);
            
            console.log(`[ModelManager] Creating material for type=${type}, modelPath=${props.modelPath}, color=${props.color}`);
            
            const texture = props.modelPath ? this.getTexture(type) || this.colormapTexture || undefined : undefined;
            const baseColor = sourceMaterial && 'color' in sourceMaterial
                ? ((sourceMaterial as THREE.MeshStandardMaterial).color?.getHex?.() ?? 0xffffff)
                : texture ? 0xffffff : props.color;
            
            console.log(`[ModelManager] Material color=${baseColor}, texture=${!!texture}`);
            
            material = createBlockMaterial(baseColor, texture, undefined, sourceMaterial);
            this.materials.set(type, material);
        }
        return material;
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}

