import * as THREE from 'three';
import { GRID, DEPTH_MARKERS } from '../config';

interface DepthMarkerPlane {
  depth: number;
  mesh: THREE.Mesh;
  wallName: 'front' | 'back' | 'left' | 'right';
}

export class DepthMarkerSystem {
  private planes: DepthMarkerPlane[] = [];
  private group: THREE.Group;
  private textureCache: Map<number, THREE.CanvasTexture> = new Map();

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'depth-markers';
    scene.add(this.group);

    this.createPlanes();
  }

  private createPlanes(): void {
    const maxDepth = 2000;
    const interval = DEPTH_MARKERS.interval;

    for (let depth = 0; depth <= maxDepth; depth += interval) {
      this.createPlaneForDepth(depth);
    }
  }

  private createPlaneForDepth(depth: number): void {
    const config = DEPTH_MARKERS;
    const texture = this.getDepthTexture(depth);

    const geometry = new THREE.PlaneGeometry(config.planeWidth, config.planeHeight);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });

    const walls: ('front' | 'back' | 'left' | 'right')[] = ['front', 'back', 'left', 'right'];

    for (const wallName of walls) {
      const mesh = new THREE.Mesh(geometry.clone(), material.clone());
      
      const pos = this.getWallPosition(wallName);
      const rot = this.getWallRotation(wallName);
      
      mesh.position.set(pos.x, -depth, pos.z);
      mesh.rotation.set(rot.x, rot.y, rot.z);
      mesh.renderOrder = 11;
      mesh.visible = false;

      this.group.add(mesh);
      this.planes.push({
        depth,
        mesh,
        wallName,
      });
    }
  }

  private getWallPosition(wallName: 'front' | 'back' | 'left' | 'right'): THREE.Vector3 {
    const offset = DEPTH_MARKERS.offset;

    switch (wallName) {
      case 'front':
        return new THREE.Vector3(0, 0, GRID.minZ - offset);
      case 'back':
        return new THREE.Vector3(0, 0, GRID.maxZ + offset);
      case 'left':
        return new THREE.Vector3(GRID.minX - offset, 0, 0);
      case 'right':
        return new THREE.Vector3(GRID.maxX + offset, 0, 0);
    }
  }

  private getWallRotation(wallName: 'front' | 'back' | 'left' | 'right'): THREE.Euler {
    switch (wallName) {
      case 'front':
        return new THREE.Euler(0, 0, 0);
      case 'back':
        return new THREE.Euler(0, Math.PI, 0);
      case 'left':
        return new THREE.Euler(0, Math.PI / 2, 0);
      case 'right':
        return new THREE.Euler(0, -Math.PI / 2, 0);
    }
  }

  private getDepthTexture(depth: number): THREE.CanvasTexture {
    let texture = this.textureCache.get(depth);
    if (texture) return texture;

    const config = DEPTH_MARKERS;
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size / 2;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = `bold ${config.fontSize}px Arial, sans-serif`;
    ctx.fillStyle = config.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = depth === 0 ? '0m' : `${depth}m`;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    if (config.textOutline) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeText(text, centerX, centerY);
    }

    ctx.fillText(text, centerX, centerY);

    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    this.textureCache.set(depth, texture);
    return texture;
  }

  update(viewY: number, cameraPosition: THREE.Vector3): void {
    const tileSpacing = 2.6;
    const rowsBelow = 5;
    const relativeViewY = viewY - this.group.position.y;
    const centerRow = Math.round(relativeViewY / tileSpacing);
    const startRow = centerRow - rowsBelow;
    const endRow = startRow + 15;

    // Calculate visible depth range using ceiling for top (less negative) and floor for bottom (more negative)
    // startRow is negative (above camera), endRow is positive (below camera)
    const minVisibleDepth = Math.ceil(-startRow) * tileSpacing;
    const maxVisibleDepth = Math.floor(-endRow) * tileSpacing;

    const farWallX: 'left' | 'right' = cameraPosition.x >= 0 ? 'left' : 'right';
    const farWallZ: 'front' | 'back' = cameraPosition.z >= 0 ? 'front' : 'back';

    for (const plane of this.planes) {
      const isFarWall = plane.wallName === farWallX || plane.wallName === farWallZ;
      const isInRange = plane.depth >= maxVisibleDepth && plane.depth <= minVisibleDepth;
      
      plane.mesh.visible = isFarWall && isInRange;
    }
  }

  applyFloatingOriginOffset(offset: number): void {
    this.group.position.y -= offset;
  }

  dispose(): void {
    for (const plane of this.planes) {
      plane.mesh.geometry.dispose();
      (plane.mesh.material as THREE.Material).dispose();
    }
    this.planes = [];

    this.textureCache.forEach((texture) => {
      texture.dispose();
    });
    this.textureCache.clear();

    this.group.parent?.remove(this.group);
  }
}
