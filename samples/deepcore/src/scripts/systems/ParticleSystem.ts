import * as THREE from 'three';
import { PARTICLES } from '../config';

interface ParticleInstance {
  index: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  baseScale: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private activeParticles: ParticleInstance[] = [];
  private freeIndices: number[] = [];
  private instancedMesh: THREE.InstancedMesh;
  public geometry: THREE.BoxGeometry;
  private material: THREE.MeshBasicMaterial;

  // Cached temp objects
  private readonly _tempVelocity = new THREE.Vector3();
  private readonly _tempMatrix = new THREE.Matrix4();
  private readonly _tempPosition = new THREE.Vector3();
  private readonly _tempQuaternion = new THREE.Quaternion();
  private readonly _tempScale = new THREE.Vector3();
  private readonly _tempColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BoxGeometry(
      PARTICLES.geometry.boxSize,
      PARTICLES.geometry.boxSize,
      PARTICLES.geometry.boxSize
    );

    // Create a simple circular glow texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);

    this.material = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      vertexColors: true,
      map: texture,
      transparent: true,
      depthWrite: false, // Better for particles
    });

    const maxCount = PARTICLES.pool.maxPoolSize;
    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, maxCount);
    
    // Initialize free indices
    for (let i = 0; i < maxCount; i++) {
        this.freeIndices.push(i);
        // Hide initial instances
        this.instancedMesh.setMatrixAt(i, new THREE.Matrix4().scale(new THREE.Vector3(0,0,0)));
    }
    
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.instancedMesh);
  }

  // Not used in batching, but kept for signature if needed (internal helper)
  private brightenColor(color: number, amount: number = 0.6): number {
    const original = new THREE.Color(color);
    const white = new THREE.Color(0xffffff);
    original.lerp(white, amount);
    return original.getHex();
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    velocityRange: number,
    velocityYMin: number,
    velocityYMax: number,
    lifeMin: number,
    lifeMax: number,
    scaleMin: number,
    scaleMax: number
  ): void {
    const brightColorHex = this.brightenColor(color, 0.5);
    this._tempColor.setHex(brightColorHex);

    for (let i = 0; i < count; i++) {
      if (this.freeIndices.length === 0) break; // Pool full
      
      const index = this.freeIndices.pop()!;
      
      const position = new THREE.Vector3(
        x + (Math.random() - 0.5) * 0.5,
        y + (Math.random() - 0.5) * 0.5,
        z + (Math.random() - 0.5) * 0.5
      );
      
      const baseScale = scaleMin + Math.random() * (scaleMax - scaleMin);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * velocityRange,
        Math.random() * (velocityYMax - velocityYMin) + velocityYMin,
        (Math.random() - 0.5) * velocityRange
      );
      
      const rotation = new THREE.Euler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      this.activeParticles.push({
        index,
        position,
        velocity,
        rotation,
        baseScale,
        life: 1.0,
        maxLife: lifeMin + Math.random() * (lifeMax - lifeMin),
      });

      // Set initial color
      this.instancedMesh.setColorAt(index, this._tempColor);
    }
    
    if (count > 0) {
        if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  // Spawn debris particles when block is destroyed
  spawnDebris(x: number, y: number, z: number, color: number, count: number = 8): void {
    this.spawnParticles(
      x, y, z, color, count,
      PARTICLES.debris.velocityRange,
      PARTICLES.debris.velocityYMin,
      PARTICLES.debris.velocityYMax,
      PARTICLES.debris.lifeMin,
      PARTICLES.debris.lifeMax,
      PARTICLES.debris.scaleMin,
      PARTICLES.debris.scaleMax
    );
  }

  // Spawn hit particles (smaller, at tool impact point)
  spawnHitParticles(x: number, y: number, z: number, color: number, count: number = 4): void {
    const brightColorHex = this.brightenColor(color, PARTICLES.hit.brightness);
    this._tempColor.setHex(brightColorHex);

    for (let i = 0; i < count; i++) {
      if (this.freeIndices.length === 0) break;

      const index = this.freeIndices.pop()!;
      
      const position = new THREE.Vector3(x, y, z);
      const baseScale = PARTICLES.hit.scaleMin + Math.random() * (PARTICLES.hit.scaleMax - PARTICLES.hit.scaleMin);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * PARTICLES.hit.velocityRange,
        Math.random() * (PARTICLES.hit.velocityYMax - PARTICLES.hit.velocityYMin) + PARTICLES.hit.velocityYMin,
        (Math.random() - 0.5) * PARTICLES.hit.velocityRange
      );

       const rotation = new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0);

      this.activeParticles.push({
        index,
        position,
        velocity,
        rotation,
        baseScale,
        life: 1.0,
        maxLife: PARTICLES.hit.lifeMin + Math.random() * (PARTICLES.hit.lifeMax - PARTICLES.hit.lifeMin),
      });
      
      this.instancedMesh.setColorAt(index, this._tempColor);
    }
    
    if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
  }

  // Spawn hit particles at exact world position (for ray intersection)
  spawnHitParticlesAtPoint(x: number, y: number, z: number, color: number, count: number = 4): void {
     this.spawnHitParticles(x, y, z, color, count);
  }

  // Spawn gold collection sparkle
  spawnCollectSparkle(x: number, y: number, z: number): void {
    const goldColor = 0xffd700;
    this._tempColor.setHex(goldColor);

    for (let i = 0; i < PARTICLES.collect.count; i++) {
      if (this.freeIndices.length === 0) break;

      const index = this.freeIndices.pop()!;
      
      const angle = (i / PARTICLES.collect.count) * Math.PI * 2;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * PARTICLES.collect.velocity,
        PARTICLES.collect.velocityY,
        Math.sin(angle) * PARTICLES.collect.velocity
      );

      this.activeParticles.push({
        index,
        position: new THREE.Vector3(x, y, z),
        velocity,
        rotation: new THREE.Euler(),
        baseScale: 0.15,
        life: 1.0,
        maxLife: PARTICLES.collect.life,
      });

      this.instancedMesh.setColorAt(index, this._tempColor);
    }

    if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
  }

  // Update particles
  update(delta: number): void {
    if (this.activeParticles.length === 0) return;

    let dirty = false;

    // Iterate backwards to allow safe removal
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];

      // Update life
      p.life -= delta / p.maxLife;

      if (p.life <= 0) {
        // Remove particle
        // Reset matrix to zero scale to hide it
        this._tempMatrix.scale(new THREE.Vector3(0, 0, 0));
        this.instancedMesh.setMatrixAt(p.index, this._tempMatrix);
        
        this.freeIndices.push(p.index);
        this.activeParticles.splice(i, 1);
        dirty = true;
        continue;
      }

      // Physics
      p.velocity.y += PARTICLES.debris.gravity * delta;
      
      this._tempVelocity.copy(p.velocity).multiplyScalar(delta);
      p.position.add(this._tempVelocity);

      // Rotation
      p.rotation.x += delta * PARTICLES.rotationSpeeds.x;
      p.rotation.y += delta * PARTICLES.rotationSpeeds.y;

      // Scale (Fade out effect)
      const lifeScale = p.life * 0.5;
      const currentScale = Math.max(0.01, p.baseScale * (lifeScale > 1 ? 1 : lifeScale));

      // Update Matrix
      this._tempPosition.copy(p.position);
      this._tempQuaternion.setFromEuler(p.rotation);
      this._tempScale.setScalar(currentScale);

      this._tempMatrix.compose(this._tempPosition, this._tempQuaternion, this._tempScale);
      this.instancedMesh.setMatrixAt(p.index, this._tempMatrix);
      
      dirty = true;
    }

    if (dirty) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Clear all particles
  clear(): void {
    // Reset all matrices
    const zeroScale = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0));
    for (const p of this.activeParticles) {
        this.instancedMesh.setMatrixAt(p.index, zeroScale);
        this.freeIndices.push(p.index);
    }
    
    if (this.activeParticles.length > 0) {
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    
    this.activeParticles = [];
  }
  
  // Set visibility (for debug)
  setVisible(visible: boolean) {
      this.instancedMesh.visible = visible;
  }

  // Dispose
  dispose(): void {
    this.clear();
    this.geometry.dispose();
    this.material.dispose();
    if (this.instancedMesh.parent) {
        this.instancedMesh.parent.remove(this.instancedMesh);
    }
  }
}
