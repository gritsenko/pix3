import * as THREE from 'three';
import { GRID, WALL_PLANES } from '../config';
import { type ISystem } from '../core/ISystem';
import { ModelManager } from '../rendering/ModelManager';

/**
 * Represents a wall plane group of instanced tiles
 */
interface WallPlane {
  name: 'front' | 'back' | 'left' | 'right';
  instancedMesh: THREE.InstancedMesh;
  targetOpacity: number;
  currentOpacity: number;
}

/**
 * WallPlaneSystem - Manages mine shaft wall planes with camera-based visibility
 * 
 * Creates 4 semi-transparent wall planes at grid boundaries.
 * Only the back wall relative to camera is visible; walls fade in/out during rotation.
 */
export class WallPlaneSystem implements ISystem {
  private walls: WallPlane[] = [];
  private group: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'wall-planes';
    scene.add(this.group);

    // Wait for models to be loaded before creating walls
    ModelManager.getInstance().onModelsLoaded(() => {
      this.createWalls();
    });
  }

  /**
   * Create the 4 wall planes as instanced meshes
   */
  private createWalls(): void {
    const modelManager = ModelManager.getInstance();
    const geometry = modelManager.getWallGeometry();
    const texture = modelManager.getWallTexture();

    if (!geometry) {
      console.warn('[WallPlaneSystem] Wall geometry not found in ModelManager');
      return;
    }

    // Calculate boundaries (0.5 is block half-size)
    const blockHalfSize = 0.7; // Preserving old offset logic
    const boundMinX = GRID.minX - blockHalfSize;
    const boundMaxX = GRID.maxX + blockHalfSize;
    const boundMinZ = GRID.minZ - blockHalfSize;
    const boundMaxZ = GRID.maxZ + blockHalfSize;
    
    // Offset walls slightly outward
    const offset = WALL_PLANES.offset;

    // Create material with texture
    const createWallMaterial = () => {
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        metalness: 0,
        roughness: 0.9,
        flatShading: true,
      });
      mat.fog = false;
      return mat;
    };

    const instanceCount = WALL_PLANES.visibleRows * 2; // 2 columns

    // Helper to create instanced mesh wall
    const createWall = (name: 'front' | 'back' | 'left' | 'right', x: number, z: number, rotationY: number): WallPlane => {
      const mesh = new THREE.InstancedMesh(geometry, createWallMaterial(), instanceCount);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // Disable culling since instances move far from mesh origin
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rotationY;
      mesh.renderOrder = 10; // Fix: Ensure walls are rendered after opaque blocks to handle transparency correctly
      
      this.group.add(mesh);
      return {
        name,
        instancedMesh: mesh,
        targetOpacity: 0,
        currentOpacity: 0,
      };
    };

    // Front (Z min)
    this.walls.push(createWall('front', (boundMinX + boundMaxX) / 2, boundMinZ - offset, 0));
    // Back (Z max)
    this.walls.push(createWall('back', (boundMinX + boundMaxX) / 2, boundMaxZ + offset, Math.PI));
    // Left (X min)
    this.walls.push(createWall('left', boundMinX - offset, (boundMinZ + boundMaxZ) / 2, Math.PI / 2));
    // Right (X max)
    this.walls.push(createWall('right', boundMaxX + offset, (boundMinZ + boundMaxZ) / 2, -Math.PI / 2));
  }

  /**
   * Update wall visibility based on camera position
   */
  updateVisibility(cameraPosition: THREE.Vector3): void {
    const maxOpacity = WALL_PLANES.maxOpacity;

    const farWallX: WallPlane['name'] = cameraPosition.x >= 0 ? 'left' : 'right';
    const farWallZ: WallPlane['name'] = cameraPosition.z >= 0 ? 'front' : 'back';

    for (const wall of this.walls) {
      wall.targetOpacity = wall.name === farWallX || wall.name === farWallZ
        ? maxOpacity
        : 0;
    }
  }

  /**
   * Update animations and sliding window tiling
   */
  update(delta: number, viewY: number = 0): void {
    const fadeSpeed = WALL_PLANES.fadeSpeed;
    const tileSpacing = WALL_PLANES.tileSpacing;
    const tileScale = WALL_PLANES.tileScale;
    const columnOffset = WALL_PLANES.columnOffset;
    const visibleRows = WALL_PLANES.visibleRows;
    const rowsBelow = WALL_PLANES.rowsBelow;
    
    // Calculate vertical sliding window relative to the group's position
    // This ensures walls scroll correctly even after floating origin resets
    const relativeViewY = viewY - this.group.position.y;
    const centerRow = Math.round(relativeViewY / tileSpacing);
    // Bias the visibility window downwards based on config
    const startRow = centerRow - rowsBelow;

    const dummy = new THREE.Object3D();

    for (const wall of this.walls) {
      // 1. Smooth lerp towards target opacity
      const diff = wall.targetOpacity - wall.currentOpacity;
      
      if (Math.abs(diff) < 0.001) {
        wall.currentOpacity = wall.targetOpacity;
      } else {
        wall.currentOpacity += diff * fadeSpeed * delta;
      }
      
      // Update material opacity
      const material = wall.instancedMesh.material as THREE.MeshStandardMaterial;
      material.opacity = wall.currentOpacity;
      material.visible = material.opacity > 0;
      
      // 2. Update sliding window instances
      if (material.visible) {
        let instanceIdx = 0;
        for (let r = 0; r < visibleRows; r++) {
          const rowY = (startRow + r) * tileSpacing;
          
          // Column 1
          dummy.position.set(-columnOffset, rowY, 0);
          dummy.rotation.x = Math.PI / 2;
          dummy.scale.set(tileScale, tileScale, tileScale);
          dummy.updateMatrix();
          wall.instancedMesh.setMatrixAt(instanceIdx++, dummy.matrix);

          // Column 2
          dummy.position.set(columnOffset, rowY, 0);
          dummy.rotation.x = Math.PI / 2;
          dummy.scale.set(tileScale, tileScale, tileScale);
          dummy.updateMatrix();
          wall.instancedMesh.setMatrixAt(instanceIdx++, dummy.matrix);
        }
        wall.instancedMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Apply floating origin offset
   */
  applyFloatingOriginOffset(offset: number): void {
    this.group.position.y -= offset;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    for (const wall of this.walls) {
      wall.instancedMesh.geometry.dispose();
      (wall.instancedMesh.material as THREE.Material).dispose();
    }
    this.walls = [];
    this.group.parent?.remove(this.group);
  }
}
