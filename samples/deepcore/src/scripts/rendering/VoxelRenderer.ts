import * as THREE from 'three';
import { BlockType, BLOCK_PROPERTIES, GRID, BLOCK_RENDERING, UNSTABLE_BLOCKS } from '../core/Types';
import { VoxelDataStore } from '../world/VoxelDataStore';

import { VoxelData, voxelKey, getBlockRotationAngles } from '../world/types';
import { getExposureBrightness } from '../world/exposure';
import { ModelManager } from './ModelManager';


/**
 * Instance mapping info - renderer internal
 */
interface InstanceInfo {
  chunkId: number;
  type: number;
  instanceId: number;
}

/**
 * Chunk render data
 */
interface ChunkRenderData {
  group: THREE.Group;
  meshes: Map<number, THREE.InstancedMesh>;
  dirty: boolean;
}

/**
 * VoxelRenderer - Handles all Three.js rendering for voxel world
 * Manages InstancedMesh, chunks, frustum culling
 * NO game logic - pure visualization
 */

export class VoxelRenderer {
  private chunks: Map<number, ChunkRenderData> = new Map();
  private rootGroup: THREE.Group = new THREE.Group();
  private geometry: THREE.BoxGeometry;
  private frustum: THREE.Frustum = new THREE.Frustum();
  private chunkHeight: number;

  // Mapping from voxel key to instance info (renderer-internal)
  private instanceMap: Map<string, InstanceInfo> = new Map();

  // Reverse mapping for fast raycast resolution: Mesh Object -> InstanceID -> Voxel Key
  private reverseInstanceMap: Map<THREE.Object3D, Map<number, string>> = new Map();

  // Animation state tracking
  private animatingVoxels: Map<
    string,
    {
      remainingTime: number;
      totalDuration: number;
      targetScale: number;
      fadeOut: boolean;
      flashRemainingTime?: number;
      flashTotalDuration?: number;
      onComplete?: () => void;
    }
  > = new Map();

  // Reusable temp objects to avoid per-frame allocations
  private readonly _tempMatrix = new THREE.Matrix4();
  private readonly _tempMatrix2 = new THREE.Matrix4();
  private readonly _tempRotMatrix = new THREE.Matrix4();
  private readonly _tempVec3 = new THREE.Vector3();
  private readonly _tempBox = new THREE.Box3();
  private readonly _tempBoxMin = new THREE.Vector3();
  private readonly _tempBoxMax = new THREE.Vector3();
  private readonly _tempEuler = new THREE.Euler();

  // Pseudo-block type for hidden (internal) blocks
  private readonly HIDDEN_BLOCK_ID = 9999;

  constructor(private store: VoxelDataStore) {
    this.chunkHeight = GRID.chunkHeight;
    this.geometry = new THREE.BoxGeometry(
      BLOCK_RENDERING.geometrySize,
      BLOCK_RENDERING.geometrySize,
      BLOCK_RENDERING.geometrySize,
      1,
      1,
      1
    );

    // Start loading models
    ModelManager.getInstance().loadAll();

    // Rebuild when models are loaded
    ModelManager.getInstance().onModelsLoaded(() => {
      this.rebuildAll();
    });
  }

  get group(): THREE.Group {
    return this.rootGroup;
  }

  // === Mesh Synchronization ===

  /**
   * Sync meshes with data store - call every frame
   */
  syncMeshes(): void {
    const dirtyChunks = this.store.consumeDirtyChunks();

    for (const chunkId of dirtyChunks) {
      this.rebuildChunk(chunkId);
    }
  }

  /**
   * Force full rebuild of all chunks
   */
  rebuildAll(): void {
    // Clear existing chunks
    for (const chunk of this.chunks.values()) {
      this.rootGroup.remove(chunk.group);
      this.disposeChunk(chunk);
    }
    this.chunks.clear();
    this.instanceMap.clear();

    // Rebuild from store
    this.store.markAllDirty();
    this.syncMeshes();
  }

  // === Frustum Culling ===

  /**
   * Update chunk visibility based on camera frustum and depth distance
   */
  updateVisibility(camera: THREE.Camera): void {
    this._tempMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this._tempMatrix);

    // Optimization: Vertical distance culling
    // Calculate cutoff depth based on camera position
    this._tempVec3.setFromMatrixPosition(camera.matrixWorld);
    const cameraY = this._tempVec3.y;
    // Camera is elevated, so effective view depth is lower. 
    // We cull chunks that are too far below the camera.
    const maxVisibleDepth = BLOCK_RENDERING.maxVisibleDepth || 40;
    // Ideally we'd use the focus point, but camera Y is a safe proxy.
    // Since camera is ~15 units up, and we want ~25 units of gameplay visible, 
    // a total safe offset is needed.
    const minVisibleY = cameraY - maxVisibleDepth;

    for (const [chunkId, chunk] of this.chunks) {
      const bounds = this.store.getChunkBounds(chunkId);
      
      // 1. Depth Culling
      // If chunk's top is below the visibility threshold, cull it immediately
      if (bounds.maxY < minVisibleY) {
        chunk.group.visible = false;
        continue;
      }

      // 2. Frustum Culling
      this._tempBoxMin.set(GRID.minX - 0.5, bounds.minY - 0.5, GRID.minZ - 0.5);
      this._tempBoxMax.set(GRID.maxX + 0.5, bounds.maxY + 0.5, GRID.maxZ + 0.5);
      this._tempBox.set(this._tempBoxMin, this._tempBoxMax);
      chunk.group.visible = this.frustum.intersectsBox(this._tempBox);
    }
  }

  // === Raycasting ===

  /**
   * Get raycast targets (all visible meshes except AIR and BEDROCK)
   */
  getRaycastTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = [];
    for (const chunk of this.chunks.values()) {
      if (!chunk.group.visible) continue;
      for (const [type, mesh] of chunk.meshes) {
        if (type !== BlockType.BEDROCK && type !== BlockType.AIR && mesh.count > 0) {
          targets.push(mesh);
        }
      }
    }
    return targets;
  }

  /**
   * Resolve intersection to voxel data
   */
  getVoxelFromIntersection(intersection: THREE.Intersection): VoxelData | undefined {
    if (intersection.instanceId === undefined) return undefined;

    const meshMap = this.reverseInstanceMap.get(intersection.object);
    if (!meshMap) return undefined;

    const key = meshMap.get(intersection.instanceId);
    if (!key) return undefined;

    const [x, y, z] = key.split(',').map(Number);
    return this.store.get(x, y, z);
  }

  // === Visual Effects ===

  /**
   * Set highlight color on a voxel
   */
  setVoxelColor(x: number, y: number, z: number, r: number, g: number, b: number): void {
    const key = voxelKey(x, y, z);
    const info = this.instanceMap.get(key);
    if (!info) return;

    const chunk = this.chunks.get(info.chunkId);
    const mesh = chunk?.meshes.get(info.type);
    if (mesh?.instanceColor) {
      mesh.setColorAt(info.instanceId, new THREE.Color(r, g, b));
      mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Trigger a "pop" animation (scale down then back)
   */
  animatePop(
    x: number,
    y: number,
    z: number,
    duration: number = 0.08,
    minScale: number = 0.8,
    shouldFlash: boolean = true
  ): void {
    const key = voxelKey(x, y, z);
    this.animatingVoxels.set(key, {
      remainingTime: duration,
      totalDuration: duration,
      targetScale: minScale,
      fadeOut: false,
      flashRemainingTime: shouldFlash ? duration : 0,
      flashTotalDuration: duration,
    });
  }

  /**
   * Trigger destruction fade-out animation
   */
  animateFadeOut(
    x: number,
    y: number,
    z: number,
    duration: number = 0.1,
    onComplete?: () => void,
    shouldFlash: boolean = true
  ): void {
    const key = voxelKey(x, y, z);
    this.animatingVoxels.set(key, {
      remainingTime: duration,
      totalDuration: duration,
      targetScale: 0,
      fadeOut: true,
      flashRemainingTime: shouldFlash ? duration : 0,
      flashTotalDuration: duration,
      onComplete,
    });
  }

  /**
   * Update all animations - call every frame
   */
  updateAnimations(deltaTime: number): void {
    const completedKeys: string[] = [];

    for (const [key, anim] of this.animatingVoxels) {
      anim.remainingTime -= deltaTime;
      if (anim.flashRemainingTime && anim.flashRemainingTime > 0) {
        anim.flashRemainingTime -= deltaTime;
      }

      const [x, y, z] = key.split(',').map(Number);
      const info = this.instanceMap.get(key);
      if (!info) {
        completedKeys.push(key);
        continue;
      }

      const chunk = this.chunks.get(info.chunkId);
      const mesh = chunk?.meshes.get(info.type);
      if (!mesh) {
        completedKeys.push(key);
        continue;
      }

      if (anim.remainingTime <= 0) {
        completedKeys.push(key);

        if (anim.fadeOut && anim.onComplete) {
          anim.onComplete();
        } else {
          // Reset to normal
          this.applyInstanceTransform(mesh, info.instanceId, x, y, z, 1.0, 1.0, 0.0);
        }
        continue;
      }

      const progress = anim.remainingTime / anim.totalDuration; // 1.0 → 0.0
      const scale = anim.targetScale + (1.0 - anim.targetScale) * progress;
      const alpha = anim.fadeOut ? progress : 1.0;

      let flash = 0;
      if (anim.flashRemainingTime && anim.flashRemainingTime > 0 && anim.flashTotalDuration) {
        // Linear decay for flash
        flash = Math.max(0, anim.flashRemainingTime / anim.flashTotalDuration);
        // Make it sharper
        flash = Math.pow(flash, 1.5);
      }

      this.applyInstanceTransform(mesh, info.instanceId, x, y, z, scale, alpha, flash);
    }

    for (const key of completedKeys) {
      this.animatingVoxels.delete(key);
    }
  }

  /**
   * Apply wobble effect to floating blocks
   */
  updateWobble(_deltaTime: number): void {
    const time = performance.now() * 0.02;

    for (const voxel of this.store.getAllVoxels()) {
      const isUnstableHeatActive = voxel.type === BlockType.UNSTABLE && voxel.unstableHeat > 0;
      const wobbleStrength = isUnstableHeatActive
        ? Math.max(voxel.wobble, 0.08 + voxel.unstableHeat * 0.22)
        : voxel.wobble;

      if (!isUnstableHeatActive && voxel.hasBottomNeighbor) continue;
      if (wobbleStrength <= 0) continue;

      const key = voxelKey(voxel.x, voxel.y, voxel.z);
      // Don't wobble if already animating
      if (this.animatingVoxels.has(key)) continue;

      const info = this.instanceMap.get(key);
      if (!info) continue;

      const chunk = this.chunks.get(info.chunkId);
      const mesh = chunk?.meshes.get(info.type);
      if (!mesh) continue;

      // Oscillating offset based on wobble intensity
      const wobbleScale = isUnstableHeatActive ? 0.05 : 0.03;
      const offsetX = Math.sin(time + voxel.x * 10) * wobbleStrength * wobbleScale;
      const offsetZ = Math.cos(time + voxel.z * 10) * wobbleStrength * wobbleScale;

      this._tempMatrix.makeTranslation(voxel.x + offsetX, voxel.y, voxel.z + offsetZ);

      if (!mesh.userData.isHiddenMesh && BLOCK_PROPERTIES[voxel.type]?.randomRotation) {
        // Prefer stored rotation indices on the VoxelData so rotation stays consistent
        this.applyBlockRotation(this._tempMatrix, voxel);
      }

      mesh.setMatrixAt(info.instanceId, this._tempMatrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // === Debug ===

  // === Internal ===

  private rebuildChunk(chunkId: number): void {
    let chunk = this.chunks.get(chunkId);
    if (!chunk) {
      chunk = this.createChunk(chunkId);
      this.chunks.set(chunkId, chunk);
      this.rootGroup.add(chunk.group);
    }

    // Clear instance map entries for this chunk
    for (const [key, info] of this.instanceMap) {
      if (info.chunkId === chunkId) {
        this.instanceMap.delete(key);
      }
    }

    // Clear reverse mapping for this chunk's meshes
    for (const mesh of chunk.meshes.values()) {
      this.reverseInstanceMap.delete(mesh);
    }

    // Prepare matrices and colors for each block type
    const matrices: Map<BlockType, THREE.Matrix4[]> = new Map();
    const colors: Map<BlockType, THREE.Color[]> = new Map();
    const stages: Map<BlockType, number[]> = new Map();
    for (const type of chunk.meshes.keys()) {
      matrices.set(type, []);
      colors.set(type, []);
      stages.set(type, []);
    }

    // Collect voxels in this chunk - include dying voxels so they can finish their fade-out animations
    const bounds = this.store.getChunkBounds(chunkId);
    const voxels = this.store.getVoxelsInYRange(bounds.minY, bounds.maxY, true);

    const tempMatrix = new THREE.Matrix4();

    for (const voxel of voxels) {
      if (voxel.type === BlockType.AIR) continue;

      const isHidden = !voxel.isVisible;
      const renderType = isHidden ? this.HIDDEN_BLOCK_ID : (voxel.type as number);
      
      tempMatrix.makeTranslation(voxel.x, voxel.y, voxel.z);

      if (!isHidden && BLOCK_PROPERTIES[voxel.type]?.randomRotation) {
        // Use stored rotation if available so the block keeps its original orientation
        this.applyBlockRotation(tempMatrix, voxel);
      }

      const arr = matrices.get(renderType);
      const colArr = colors.get(renderType);

      if (arr && colArr) {
        const instanceId = arr.length;
        arr.push(tempMatrix.clone());
        const stageArr = stages.get(renderType);
        if (stageArr) {
          stageArr.push(!isHidden ? (voxel.damageStage ?? 0) : 0);
        }

        if (renderType !== BlockType.BEDROCK) {
          let brightness = isHidden ? 0 : getExposureBrightness(voxel.exposureDistance, voxel.isVisible);
          if (!isHidden && voxel.type === BlockType.UNSTABLE) {
            const unstableBrightness = UNSTABLE_BLOCKS.initialBrightnessMultiplier +
              (UNSTABLE_BLOCKS.maxBrightnessMultiplier - UNSTABLE_BLOCKS.initialBrightnessMultiplier) * voxel.unstableHeat;
            brightness *= unstableBrightness;
          }
          colArr.push(new THREE.Color(brightness, brightness, brightness));
        }

        const key = voxelKey(voxel.x, voxel.y, voxel.z);
        // Store instance mapping
        this.instanceMap.set(key, {
          chunkId,
          type: renderType,
          instanceId,
        });

        // Store reverse mapping
        const mesh = chunk.meshes.get(renderType);
        if (mesh) {
          let meshMap = this.reverseInstanceMap.get(mesh);
          if (!meshMap) {
            meshMap = new Map();
            this.reverseInstanceMap.set(mesh, meshMap);
          }
          meshMap.set(instanceId, key);
        }
      }
    }

    // Update instanced meshes

    for (const [type, mesh] of chunk.meshes) {
      const mats = matrices.get(type) || [];
      const cols = colors.get(type) || [];
      mesh.count = mats.length;

      for (let i = 0; i < mats.length; i++) {
        mesh.setMatrixAt(i, mats[i]);

        if (type !== BlockType.BEDROCK) {
          const color = cols[i];
          if (color) mesh.setColorAt(i, color);
        }
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      const stageAttr = mesh.geometry.getAttribute('instanceDamageStage') as THREE.InstancedBufferAttribute;
      if (stageAttr) {
        const stageValues = stages.get(type) || [];
        for (let i = 0; i < mats.length; i++) {
          stageAttr.setX(i, stageValues[i] ?? 0);
        }
        stageAttr.needsUpdate = true;
      }

      // Restore animation state for this chunk after rebuild
      const alphaAttr = mesh.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute;
      const flashAttr = mesh.geometry.getAttribute('instanceHitFlash') as THREE.InstancedBufferAttribute;

      if (alphaAttr || flashAttr) {
        // Reset all first
        for (let i = 0; i < mats.length; i++) {
          if (alphaAttr) alphaAttr.setX(i, 1.0);
          if (flashAttr) flashAttr.setX(i, 0.0);
        }

        // Re-apply active animations
        for (const [key, anim] of this.animatingVoxels) {
          const info = this.instanceMap.get(key);
          if (info && info.chunkId === chunkId && info.type === type) {
            const i = info.instanceId;
            const progress = anim.remainingTime / anim.totalDuration;
            const scale = anim.targetScale + (1.0 - anim.targetScale) * progress;
            const alpha = anim.fadeOut ? progress : 1.0;

            let flash = 0;
            if (anim.flashRemainingTime && anim.flashRemainingTime > 0 && anim.flashTotalDuration) {
              flash = Math.max(0, anim.flashRemainingTime / anim.flashTotalDuration);
              flash = Math.pow(flash, 1.5);
            }

            // Apply transform (includes random rotation and scale)
            const [vx, vy, vz] = key.split(',').map(Number);
            this.applyInstanceTransform(mesh, i, vx, vy, vz, scale, alpha, flash);
          }
        }

        if (alphaAttr) alphaAttr.needsUpdate = true;
        if (flashAttr) flashAttr.needsUpdate = true;
      }
    }

    chunk.dirty = false;
  }

  private createChunk(chunkId: number): ChunkRenderData {
    const group = new THREE.Group();
    group.userData = { chunkId };
    const meshes = new Map<number, THREE.InstancedMesh>();
    const maxPerChunk =
      this.chunkHeight * (GRID.maxX - GRID.minX + 1) * (GRID.maxZ - GRID.minZ + 1);

    // Get all real block types plus our pseudo hidden type
    const blockTypes: number[] = [
      ...Object.keys(BLOCK_PROPERTIES).map(Number).filter(t => t !== BlockType.AIR),
      this.HIDDEN_BLOCK_ID
    ];

    for (const type of blockTypes) {
      let material: THREE.Material;
      let geometry: THREE.BufferGeometry;
      
      if (type === this.HIDDEN_BLOCK_ID) {
        // Simple cube for hidden blocks
        geometry = this.geometry.clone();
        material = new THREE.MeshStandardMaterial({
          color: 0x000000,
          roughness: 1.0,
          metalness: 0.0,
          flatShading: true
        });
      } else {
        const mm = ModelManager.getInstance();

        const resources = mm.createBlockRenderResources(type);
        geometry = resources.geometry;
        material = resources.material;
      }

      const mesh = new THREE.InstancedMesh(geometry, material, maxPerChunk);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.isHiddenMesh = type === this.HIDDEN_BLOCK_ID;

      if (type === (BlockType.AIR as number)) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      } else {
        mesh.castShadow = type !== this.HIDDEN_BLOCK_ID; // Hidden blocks don't need to cast shadows (inner)
        mesh.receiveShadow = true;

        // Add instanceAlpha attribute for fading
        const alphas = new Float32Array(maxPerChunk).fill(1.0);
        mesh.geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(alphas, 1));

        // Add instanceHitFlash attribute
        const flashes = new Float32Array(maxPerChunk).fill(0.0);
        mesh.geometry.setAttribute('instanceHitFlash', new THREE.InstancedBufferAttribute(flashes, 1));

        const damageStageBuffer = new Float32Array(maxPerChunk).fill(0);
        mesh.geometry.setAttribute(
          'instanceDamageStage',
          new THREE.InstancedBufferAttribute(damageStageBuffer, 1)
        );
      }

      meshes.set(type, mesh);
      group.add(mesh);
    }

    return { group, meshes: meshes as any, dirty: false };
  }

  private applyInstanceTransform(
    mesh: THREE.InstancedMesh,
    instanceId: number,
    x: number,
    y: number,
    z: number,
    scale: number,
    alpha: number,
    flash: number = 0
  ): void {
    this._tempMatrix2.makeTranslation(x, y, z);

    // Re-apply random rotation if needed (prefer stored rotation)
    // Optimization: skip rotation for simple cubes (hidden blocks)
    if (!mesh.userData.isHiddenMesh) {
      const voxel = this.store.get(x, y, z);
      if (voxel && BLOCK_PROPERTIES[voxel.type]?.randomRotation) {
        this.applyBlockRotation(this._tempMatrix2, voxel);
      }
    }

    this._tempVec3.set(scale, scale, scale);
    this._tempMatrix2.scale(this._tempVec3);
    mesh.setMatrixAt(instanceId, this._tempMatrix2);
    mesh.instanceMatrix.needsUpdate = true;

    const alphaAttr = mesh.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute;
    if (alphaAttr) {
      alphaAttr.setX(instanceId, alpha);
      alphaAttr.needsUpdate = true;
    }

    const flashAttr = mesh.geometry.getAttribute('instanceHitFlash') as THREE.InstancedBufferAttribute;
    if (flashAttr) {
      flashAttr.setX(instanceId, flash);
      flashAttr.needsUpdate = true;
    }
  }

  private disposeChunk(chunk: ChunkRenderData): void {
    for (const mesh of chunk.meshes.values()) {
      // Only dispose if it's NOT the shared default geometry AND NOT a shared loaded geometry
      // Actually, loaded geometries are shared via ModelManager and shouldn't be disposed here.
      // The only thing we might have created uniquely is AIR geometry?
      // But AIR geometry creates a new BoxGeometry in createChunk.
      if (
        (mesh.geometry instanceof THREE.BoxGeometry && mesh.geometry !== this.geometry && !this.isSharedGeometry(mesh.geometry)) ||
        (mesh.geometry.userData && mesh.geometry.userData.isInstancedClone)
      ) {
        mesh.geometry.dispose();
      }
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
  }

  // === Disposal ===

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      this.rootGroup.remove(chunk.group);
      this.disposeChunk(chunk);
    }
    this.chunks.clear();
    this.instanceMap.clear();
    this.animatingVoxels.clear();
    this.geometry.dispose();
  }

  private applyBlockRotation(matrix: THREE.Matrix4, voxelOrX: VoxelData | number, y?: number, z?: number): void {
    let rotX: number;
    let rotY: number;
    let rotZ: number;

    if (typeof voxelOrX === 'object') {
      const voxel = voxelOrX as VoxelData;
      if (voxel.rotXIndex !== undefined && voxel.rotYIndex !== undefined && voxel.rotZIndex !== undefined) {
        rotX = voxel.rotXIndex * (Math.PI / 2);
        rotY = voxel.rotYIndex * (Math.PI / 2);
        rotZ = voxel.rotZIndex * (Math.PI / 2);
      } else {
        // Fallback to centralized rotation utility
        const angles = getBlockRotationAngles(voxel.x, voxel.y, voxel.z);
        rotX = angles.rotX;
        rotY = angles.rotY;
        rotZ = angles.rotZ;
      }
    } else {
      const x = voxelOrX as number;
      // x,y,z provided - use centralized utility
      const angles = getBlockRotationAngles(x, y as number, z as number);
      rotX = angles.rotX;
      rotY = angles.rotY;
      rotZ = angles.rotZ;
    }

    this._tempEuler.set(rotX, rotY, rotZ);
    this._tempRotMatrix.makeRotationFromEuler(this._tempEuler);
    matrix.multiply(this._tempRotMatrix);
  }

  private isSharedGeometry(_geo: THREE.BufferGeometry): boolean {
    // Check if it's one of the model manager geometries
    // This is a bit hacky, better if ModelManager handles disposal or we use a flag
    // For now, let's assume if it came from ModelManager we don't dispose it here.
    // The easiest check is if it equals any of the cached ones, but that's O(N).
    // Or we just don't dispose geometries here unless we know we created them (like AIR).
    return false; // TODO: refine disposal logic
  }
}
