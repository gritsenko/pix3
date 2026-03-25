import * as THREE from 'three';
import { PARTICLES } from '../config';
import type { ExplosionImpactSparksConfig } from '../config/types';

interface ImpactSparkParticle {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  direction: THREE.Vector3;
  life: number;
  maxLife: number;
  sparkScale: number;
  glowScale: number;
}

export class ImpactSparkSystem {
  private readonly config = PARTICLES.impactSparks;
  private readonly explosionConfig: ExplosionImpactSparksConfig = PARTICLES.explosionImpactSparks;
  private readonly particles: ImpactSparkParticle[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly glowMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly axisZ = new THREE.Vector3(0, 0, 1);
  private readonly tempDirection = new THREE.Vector3();
  private readonly cameraQuaternion = new THREE.Quaternion();
  private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly sparkGeometry: THREE.ConeGeometry;
  private readonly glowGeometry: THREE.PlaneGeometry;
  private readonly sparkMaterial: THREE.MeshBasicMaterial;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly glowAlphaAttribute: THREE.InstancedBufferAttribute;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera
  ) {
    this.sparkGeometry = new THREE.ConeGeometry(
      this.config.sparkRadius,
      this.config.sparkLength,
      3
    );
    this.sparkGeometry.rotateX(-Math.PI / 2);

    this.glowGeometry = new THREE.PlaneGeometry(this.config.glowSize, this.config.glowSize);

    this.sparkMaterial = new THREE.MeshBasicMaterial({
      color: this.config.sparkColor,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });

    this.glowTexture = this.createGlowTexture(this.config.glowTextureSize);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: this.config.glowColor,
      map: this.glowTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: this.config.glowOpacity,
      toneMapped: false,
    });
    this.glowMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float instanceAlpha;
          varying float vInstanceAlpha;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vInstanceAlpha = instanceAlpha;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vInstanceAlpha;`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.a *= vInstanceAlpha;`
        );
    };

    this.sparkMesh = new THREE.InstancedMesh(this.sparkGeometry, this.sparkMaterial, this.config.maxPoolSize);
    this.glowMesh = new THREE.InstancedMesh(this.glowGeometry, this.glowMaterial, this.config.maxPoolSize);
    this.glowAlphaAttribute = new THREE.InstancedBufferAttribute(new Float32Array(this.config.maxPoolSize), 1);
    this.glowMesh.geometry.setAttribute('instanceAlpha', this.glowAlphaAttribute);
    this.sparkMesh.renderOrder = this.config.renderOrder;
    this.glowMesh.renderOrder = this.config.renderOrder;
    this.sparkMesh.frustumCulled = false;
    this.glowMesh.frustumCulled = false;
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.config.maxPoolSize; i++) {
      this.particles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        direction: new THREE.Vector3(0, 0, 1),
        life: 0,
        maxLife: this.config.life,
        sparkScale: this.config.scaleMin,
        glowScale: 1,
      });

      this.sparkMesh.setMatrixAt(i, this.zeroMatrix);
      this.glowMesh.setMatrixAt(i, this.zeroMatrix);
      this.glowAlphaAttribute.setX(i, 0);
    }

    scene.add(this.sparkMesh);
    scene.add(this.glowMesh);
  }

  spawn(
    x: number,
    y: number,
    z: number,
    options?: {
      burstCount?: number;
      speedMinMultiplier?: number;
      speedMaxMultiplier?: number;
      scaleMinMultiplier?: number;
      scaleMaxMultiplier?: number;
      glowSizeMultiplier?: number;
      spawnJitterMultiplier?: number;
    }
  ): void {
    const burstCount = options?.burstCount ?? this.config.burstCount;
    const speedMinMultiplier = options?.speedMinMultiplier ?? 1;
    const speedMaxMultiplier = options?.speedMaxMultiplier ?? 1;
    const scaleMinMultiplier = options?.scaleMinMultiplier ?? 1;
    const scaleMaxMultiplier = options?.scaleMaxMultiplier ?? 1;
    const glowSizeMultiplier = options?.glowSizeMultiplier ?? 1;
    const spawnJitterMultiplier = options?.spawnJitterMultiplier ?? 1;
    let spawned = 0;

    for (let i = 0; i < this.particles.length && spawned < burstCount; i++) {
      const particle = this.particles[i];
      if (particle.active) {
        continue;
      }

      particle.active = true;
      particle.maxLife = this.config.life;
      particle.life = this.config.life;
      particle.position.set(
        x + (Math.random() - 0.5) * this.config.spawnJitter * spawnJitterMultiplier,
        y + (Math.random() - 0.5) * this.config.spawnJitter * spawnJitterMultiplier,
        z + (Math.random() - 0.5) * this.config.spawnJitter * spawnJitterMultiplier
      );

      this.tempDirection.set(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      );

      if (this.tempDirection.lengthSq() < 1e-6) {
        this.tempDirection.set(0, 1, 0);
      } else {
        this.tempDirection.normalize();
      }

      particle.direction.copy(this.tempDirection);
      particle.velocity.copy(this.tempDirection).multiplyScalar(
        this.config.speedMin * speedMinMultiplier +
        Math.random() * ((this.config.speedMax * speedMaxMultiplier) - (this.config.speedMin * speedMinMultiplier))
      );
      particle.sparkScale =
        this.config.scaleMin * scaleMinMultiplier +
        Math.random() * ((this.config.scaleMax * scaleMaxMultiplier) - (this.config.scaleMin * scaleMinMultiplier));
      particle.glowScale = (0.9 + Math.random() * 0.5) * glowSizeMultiplier;
      spawned++;
    }
  }

  spawnExplosion(x: number, y: number, z: number): void {
    this.spawn(x, y, z, this.explosionConfig);
  }

  update(delta: number): void {
    let dirty = false;
    this.camera.getWorldQuaternion(this.cameraQuaternion);

    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      if (!particle.active) {
        continue;
      }

      particle.life -= delta * this.config.lifeDecay;

      if (particle.life <= 0) {
        particle.active = false;
        this.sparkMesh.setMatrixAt(i, this.zeroMatrix);
        this.glowMesh.setMatrixAt(i, this.zeroMatrix);
        this.glowAlphaAttribute.setX(i, 0);
        dirty = true;
        continue;
      }

      const lifeRatio = particle.life / particle.maxLife;
      const elapsed = (particle.maxLife - particle.life) / this.config.lifeDecay;
      const glowLifeRatio = Math.max(0, 1 - elapsed / this.config.glowFadeTime);
      particle.position.addScaledVector(particle.velocity, delta);
      particle.velocity.y += this.config.gravity * delta;
      particle.velocity.multiplyScalar(Math.pow(this.config.drag, delta * 60));

      if (particle.velocity.lengthSq() > 1e-6) {
        particle.direction.copy(particle.velocity).normalize();
      }

      this.dummy.position.copy(particle.position);
      this.dummy.quaternion.setFromUnitVectors(this.axisZ, particle.direction);
      this.dummy.scale.setScalar(Math.max(this.config.scaleMin, particle.sparkScale * lifeRatio));
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.dummy.matrix);

      this.dummy.quaternion.copy(this.cameraQuaternion);
      this.dummy.scale.setScalar(Math.max(0.001, this.config.glowSize * particle.glowScale * (0.35 + lifeRatio * 0.65)));
      this.dummy.updateMatrix();
      this.glowMesh.setMatrixAt(i, this.dummy.matrix);
      this.glowAlphaAttribute.setX(i, glowLifeRatio);
      dirty = true;
    }

    if (dirty) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      this.glowMesh.instanceMatrix.needsUpdate = true;
      this.glowAlphaAttribute.needsUpdate = true;
    }
  }

  setVisible(visible: boolean): void {
    this.sparkMesh.visible = visible;
    this.glowMesh.visible = visible;
  }

  dispose(): void {
    this.sparkGeometry.dispose();
    this.glowGeometry.dispose();
    this.glowTexture.dispose();
    this.sparkMaterial.dispose();
    this.glowMaterial.dispose();
    this.sparkMesh.parent?.remove(this.sparkMesh);
    this.glowMesh.parent?.remove(this.glowMesh);
  }

  private createGlowTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const center = size / 2;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
      gradient.addColorStop(0.0, 'rgba(255, 186, 48, 0.95)');
      gradient.addColorStop(0.18, 'rgba(255, 154, 24, 0.88)');
      gradient.addColorStop(0.45, 'rgba(255, 110, 8, 0.6)');
      gradient.addColorStop(0.78, 'rgba(255, 78, 0, 0.18)');
      gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
