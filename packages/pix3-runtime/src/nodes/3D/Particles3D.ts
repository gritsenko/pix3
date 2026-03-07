import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';

import { coerceTextureResource, type TextureResourceRef } from '../../core/TextureResource';
import type { PropertySchema } from '../../fw/property-schema';
import { Node3D, type Node3DProps } from '../Node3D';

export type ParticleEmitterShape = 'point' | 'sphere' | 'box';
export type ParticleRenderShape = 'plane' | 'sphere' | 'cube';

export interface Particles3DProps extends Omit<Node3DProps, 'type'> {
  texture?: TextureResourceRef | null;
  texturePath?: string | null;
  emitterShape?: ParticleEmitterShape;
  emitterRadius?: number;
  emitterBoxSize?: { x: number; y: number; z: number };
  particleShape?: ParticleRenderShape;
  emissionRate?: number;
  maxParticles?: number;
  lifetime?: number;
  speed?: number;
  speedSpread?: number;
  gravity?: { x: number; y: number; z: number };
  particleSize?: number;
  sizeRandomness?: number;
  startColor?: string;
  endColor?: string;
  startAlpha?: number;
  endAlpha?: number;
  billboard?: boolean;
  playing?: boolean;
  loop?: boolean;
  prewarm?: boolean;
  preview?: boolean;
  disableRotation?: boolean;
  simulationSpace?: 'local' | 'world';
}

interface ParticleState {
  active: boolean;
  age: number;
  lifetime: number;
  position: Vector3;
  velocity: Vector3;
  size: number;
  rotation: number;
  angularVelocity: number;
}

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

export class Particles3D extends Node3D {
  texture: TextureResourceRef | null;
  emitterShape: ParticleEmitterShape;
  emitterRadius: number;
  emitterBoxSize: { x: number; y: number; z: number };
  particleShape: ParticleRenderShape;
  emissionRate: number;
  maxParticles: number;
  lifetime: number;
  speed: number;
  speedSpread: number;
  gravity: { x: number; y: number; z: number };
  particleSize: number;
  sizeRandomness: number;
  startColor: string;
  endColor: string;
  startAlpha: number;
  endAlpha: number;
  billboard: boolean;
  playing: boolean;
  loop: boolean;
  prewarm: boolean;
  preview: boolean;
  disableRotation: boolean;
  simulationSpace: 'local' | 'world';

  private particles: ParticleState[] = [];
  private emissionAccumulator = 0;
  private activeCount = 0;

  private readonly renderRoot: Mesh;
  private instancedMesh: InstancedMesh | null = null;
  private readonly material: MeshBasicMaterial;
  private instanceColorAttr: InstancedBufferAttribute;
  private instanceAlphaAttr: InstancedBufferAttribute;

  private readonly startColorVec = new Color();
  private readonly endColorVec = new Color();
  private readonly tempColor = new Color();
  private readonly tempMatrix = new Matrix4();
  private readonly tempScale = new Vector3(1, 1, 1);
  private readonly tempQuat = new Quaternion();
  private readonly tempQuatWorld = new Quaternion();
  private readonly tempQuatNode = new Quaternion();
  private readonly tempQuatRot = new Quaternion();
  private readonly tempVelocity = new Vector3();
  private readonly tempDirection = new Vector3();

  constructor(props: Particles3DProps) {
    super(props, 'Particles3D');

    this.texture = coerceTextureResource(props.texture ?? props.texturePath ?? null);
    this.emitterShape = props.emitterShape ?? 'point';
    this.emitterRadius = Math.max(0, props.emitterRadius ?? 0.5);
    this.emitterBoxSize = props.emitterBoxSize ?? { x: 1, y: 1, z: 1 };
    this.particleShape = props.particleShape ?? 'plane';
    this.emissionRate = Math.max(0, props.emissionRate ?? 24);
    this.maxParticles = Math.max(1, Math.floor(props.maxParticles ?? 512));
    this.lifetime = Math.max(0.01, props.lifetime ?? 2);
    this.speed = Math.max(0, props.speed ?? 2);
    this.speedSpread = Math.max(0, props.speedSpread ?? 0.5);
    this.gravity = props.gravity ?? { x: 0, y: 0, z: 0 };
    this.particleSize = Math.max(0.001, props.particleSize ?? 0.2);
    this.sizeRandomness = MathUtils.clamp(props.sizeRandomness ?? 0.2, 0, 1);
    this.startColor = props.startColor ?? '#ffffff';
    this.endColor = props.endColor ?? '#ffd24d';
    this.startAlpha = MathUtils.clamp(props.startAlpha ?? 1, 0, 1);
    this.endAlpha = MathUtils.clamp(props.endAlpha ?? 0, 0, 1);
    this.billboard = props.billboard ?? true;
    this.playing = props.playing ?? true;
    this.loop = props.loop ?? true;
    this.prewarm = props.prewarm ?? false;
    this.preview = props.preview ?? false;
    this.disableRotation = props.disableRotation ?? false;
    this.simulationSpace = props.simulationSpace ?? 'local';

    this.material = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexColors: false,
      side: DoubleSide,
    });
    this.configureMaterialForInstanceAlpha();

    this.renderRoot = new Mesh();
    this.renderRoot.name = `${this.name}-Particles`;
    this.add(this.renderRoot);

    this.instanceColorAttr = new InstancedBufferAttribute(
      new Float32Array(this.maxParticles * 3),
      3
    );
    this.instanceColorAttr.setUsage(DynamicDrawUsage);
    this.instanceAlphaAttr = new InstancedBufferAttribute(new Float32Array(this.maxParticles), 1);
    this.instanceAlphaAttr.setUsage(DynamicDrawUsage);

    this.initializeParticles();
    this.rebuildRenderer();

    if (this.prewarm && this.playing) {
      this.prewarmSimulation();
    }
  }

  get texturePath(): string | null {
    return this.texture?.url ?? null;
  }

  set texturePath(value: string | null) {
    this.texture = coerceTextureResource(value);
  }

  setTextureResource(value: unknown): void {
    this.texture = coerceTextureResource(value);
  }

  setTexture(texture: Texture): void {
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  clearTexture(): void {
    this.material.map = null;
    this.material.needsUpdate = true;
  }

  setMaxParticles(count: number): void {
    const next = Math.max(1, Math.floor(count));
    if (next === this.maxParticles) {
      return;
    }

    this.maxParticles = next;
    this.instanceColorAttr = new InstancedBufferAttribute(
      new Float32Array(this.maxParticles * 3),
      3
    );
    this.instanceColorAttr.setUsage(DynamicDrawUsage);
    this.instanceAlphaAttr = new InstancedBufferAttribute(new Float32Array(this.maxParticles), 1);
    this.instanceAlphaAttr.setUsage(DynamicDrawUsage);
    this.initializeParticles();
    this.rebuildRenderer();
  }

  setParticleShape(shape: ParticleRenderShape): void {
    if (shape === this.particleShape) {
      return;
    }
    this.particleShape = shape;
    this.rebuildRenderer();
  }

  restart(): void {
    for (const particle of this.particles) {
      particle.active = false;
      particle.age = 0;
    }
    this.activeCount = 0;
    this.emissionAccumulator = 0;
    if (this.instancedMesh) {
      this.instancedMesh.count = 0;
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  applyBillboard(cameraQuaternion: Quaternion): void {
    if (!this.billboard || this.particleShape !== 'plane' || !this.instancedMesh) {
      return;
    }

    this.getWorldQuaternion(this.tempQuatWorld);
    this.tempQuatNode.copy(this.tempQuatWorld).invert().multiply(cameraQuaternion);

    let renderIndex = 0;
    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];
      if (!particle.active) {
        continue;
      }

      this.tempQuat.copy(this.tempQuatNode);
      this.tempQuatRot.setFromAxisAngle(FORWARD, particle.rotation);
      this.tempQuat.multiply(this.tempQuatRot);

      this.tempScale.set(particle.size, particle.size, particle.size);
      this.tempMatrix.compose(particle.position, this.tempQuat, this.tempScale);
      this.instancedMesh.setMatrixAt(renderIndex, this.tempMatrix);
      renderIndex += 1;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  override tick(dt: number): void {
    super.tick(dt);

    if ((!this.playing && !this.preview) || dt <= 0) {
      return;
    }

    const clampedDt = Math.min(dt, 1 / 20);
    this.spawnParticles(clampedDt);
    this.updateParticles(clampedDt);
  }

  private initializeParticles(): void {
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i += 1) {
      this.particles.push({
        active: false,
        age: 0,
        lifetime: this.lifetime,
        position: new Vector3(),
        velocity: new Vector3(),
        size: this.particleSize,
        rotation: 0,
        angularVelocity: 0,
      });
    }
  }

  private prewarmSimulation(): void {
    const step = 1 / 60;
    const duration = Math.min(this.lifetime, 3);
    const steps = Math.floor(duration / step);
    for (let i = 0; i < steps; i += 1) {
      this.spawnParticles(step);
      this.updateParticles(step);
    }
  }

  private spawnParticles(dt: number): void {
    if (!this.loop && this.activeCount >= this.maxParticles) {
      return;
    }

    this.emissionAccumulator += this.emissionRate * dt;
    let spawnCount = Math.floor(this.emissionAccumulator);
    if (spawnCount <= 0) {
      return;
    }
    this.emissionAccumulator -= spawnCount;

    for (let i = 0; i < this.particles.length && spawnCount > 0; i += 1) {
      const particle = this.particles[i];
      if (particle.active) {
        continue;
      }

      this.activateParticle(particle);
      spawnCount -= 1;
    }
  }

  private activateParticle(particle: ParticleState): void {
    particle.active = true;
    particle.age = 0;
    particle.lifetime = this.lifetime * MathUtils.lerp(0.85, 1.15, Math.random());
    particle.rotation = this.disableRotation ? 0 : Math.random() * Math.PI * 2;
    particle.angularVelocity = this.disableRotation ? 0 : MathUtils.lerp(-3, 3, Math.random());
    this.assignSpawnPosition(particle.position);

    this.tempDirection.set(
      MathUtils.randFloatSpread(2),
      Math.random() * 1.5,
      MathUtils.randFloatSpread(2)
    );
    if (this.tempDirection.lengthSq() < 1e-5) {
      this.tempDirection.copy(UP);
    }
    this.tempDirection.normalize();

    const speedJitter = MathUtils.randFloatSpread(this.speedSpread * 2);
    const speed = Math.max(0, this.speed + speedJitter);
    particle.velocity.copy(this.tempDirection.multiplyScalar(speed));

    const sizeScale = 1 - this.sizeRandomness + Math.random() * this.sizeRandomness;
    particle.size = Math.max(0.001, this.particleSize * sizeScale);
  }

  private assignSpawnPosition(target: Vector3): void {
    if (this.emitterShape === 'sphere') {
      this.tempDirection.set(
        MathUtils.randFloatSpread(2),
        MathUtils.randFloatSpread(2),
        MathUtils.randFloatSpread(2)
      );
      if (this.tempDirection.lengthSq() < 1e-5) {
        this.tempDirection.copy(UP);
      }
      this.tempDirection.normalize().multiplyScalar(Math.random() * this.emitterRadius);
      target.copy(this.tempDirection);
      return;
    }

    if (this.emitterShape === 'box') {
      target.set(
        MathUtils.randFloatSpread(this.emitterBoxSize.x),
        MathUtils.randFloatSpread(this.emitterBoxSize.y),
        MathUtils.randFloatSpread(this.emitterBoxSize.z)
      );
      return;
    }

    target.set(0, 0, 0);
  }

  private updateParticles(dt: number): void {
    if (!this.instancedMesh) {
      return;
    }

    this.startColorVec.set(this.startColor);
    this.endColorVec.set(this.endColor);

    let visibleCount = 0;

    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];
      if (!particle.active) {
        continue;
      }

      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        particle.active = false;
        continue;
      }

      this.tempVelocity.set(this.gravity.x, this.gravity.y, this.gravity.z).multiplyScalar(dt);
      particle.velocity.add(this.tempVelocity);
      particle.position.addScaledVector(particle.velocity, dt);
      particle.rotation += particle.angularVelocity * dt;

      const life = MathUtils.clamp(particle.age / particle.lifetime, 0, 1);
      const alpha = MathUtils.lerp(this.startAlpha, this.endAlpha, life);
      this.tempColor.copy(this.startColorVec).lerp(this.endColorVec, life);

      this.tempQuat.identity();
      if (!this.billboard || this.particleShape !== 'plane') {
        this.tempQuat.setFromAxisAngle(FORWARD, particle.rotation);
      }

      this.tempScale.set(particle.size, particle.size, particle.size);
      this.tempMatrix.compose(particle.position, this.tempQuat, this.tempScale);
      this.instancedMesh.setMatrixAt(visibleCount, this.tempMatrix);
      this.instanceColorAttr.setXYZ(
        visibleCount,
        this.tempColor.r,
        this.tempColor.g,
        this.tempColor.b
      );
      this.instanceAlphaAttr.setX(visibleCount, alpha);
      visibleCount += 1;
    }

    this.activeCount = visibleCount;
    this.instancedMesh.count = visibleCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.instanceColorAttr.needsUpdate = true;
    this.instanceAlphaAttr.needsUpdate = true;
  }

  private buildRenderGeometry(): PlaneGeometry | BoxGeometry | SphereGeometry {
    if (this.particleShape === 'cube') {
      return new BoxGeometry(1, 1, 1);
    }
    if (this.particleShape === 'sphere') {
      return new SphereGeometry(0.5, 8, 8);
    }
    return new PlaneGeometry(1, 1);
  }

  private rebuildRenderer(): void {
    if (this.instancedMesh) {
      this.renderRoot.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
    }

    const geometry = this.buildRenderGeometry();
    this.instancedMesh = new InstancedMesh(geometry, this.material, this.maxParticles);
    this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.count = 0;
    this.instancedMesh.instanceColor = this.instanceColorAttr;
    this.instancedMesh.geometry.setAttribute('instanceAlpha', this.instanceAlphaAttr);
    this.renderRoot.add(this.instancedMesh);
  }

  private configureMaterialForInstanceAlpha(): void {
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <color_pars_vertex>',
          '#include <color_pars_vertex>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;'
        )
        .replace(
          '#include <color_vertex>',
          '#include <color_vertex>\nvInstanceAlpha = instanceAlpha;'
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <color_pars_fragment>',
          '#include <color_pars_fragment>\nvarying float vInstanceAlpha;'
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );'
        );
    };

    this.material.customProgramCacheKey = () => 'pix3-particles3d-instance-alpha-v1';
    this.material.needsUpdate = true;
  }

  static getPropertySchema(): PropertySchema {
    const baseSchema = Node3D.getPropertySchema();
    return {
      nodeType: 'Particles3D',
      extends: 'Node3D',
      properties: [
        ...baseSchema.properties,
        {
          name: 'texture',
          type: 'object',
          ui: {
            label: 'Texture',
            group: 'Rendering',
            editor: 'texture-resource',
            resourceType: 'texture',
          },
          getValue: (node: unknown) =>
            (node as Particles3D).texture ?? { type: 'texture', url: '' },
          setValue: (node: unknown, value: unknown) =>
            (node as Particles3D).setTextureResource(value),
        },
        {
          name: 'particleShape',
          type: 'enum',
          ui: { label: 'Particle Shape', group: 'Rendering', options: ['plane', 'sphere', 'cube'] },
          getValue: (node: unknown) => (node as Particles3D).particleShape,
          setValue: (node: unknown, value: unknown) => {
            const next = String(value) as ParticleRenderShape;
            if (next === 'plane' || next === 'sphere' || next === 'cube') {
              (node as Particles3D).setParticleShape(next);
            }
          },
        },
        {
          name: 'particleSize',
          type: 'number',
          ui: {
            label: 'Particle Size',
            group: 'Rendering',
            min: 0.01,
            max: 5,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).particleSize,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).particleSize = Math.max(0.01, Number(value));
          },
        },
        {
          name: 'sizeRandomness',
          type: 'number',
          ui: {
            label: 'Size Randomness',
            group: 'Rendering',
            min: 0,
            max: 1,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).sizeRandomness,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).sizeRandomness = MathUtils.clamp(Number(value), 0, 1);
          },
        },
        {
          name: 'startColor',
          type: 'color',
          ui: { label: 'Start Color', group: 'Rendering' },
          getValue: (node: unknown) => (node as Particles3D).startColor,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).startColor = String(value);
          },
        },
        {
          name: 'endColor',
          type: 'color',
          ui: { label: 'End Color', group: 'Rendering' },
          getValue: (node: unknown) => (node as Particles3D).endColor,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).endColor = String(value);
          },
        },
        {
          name: 'startAlpha',
          type: 'number',
          ui: {
            label: 'Start Alpha',
            group: 'Rendering',
            min: 0,
            max: 1,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).startAlpha,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).startAlpha = MathUtils.clamp(Number(value), 0, 1);
          },
        },
        {
          name: 'endAlpha',
          type: 'number',
          ui: {
            label: 'End Alpha',
            group: 'Rendering',
            min: 0,
            max: 1,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).endAlpha,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).endAlpha = MathUtils.clamp(Number(value), 0, 1);
          },
        },
        {
          name: 'billboard',
          type: 'boolean',
          ui: { label: 'Billboard', group: 'Rendering' },
          getValue: (node: unknown) => (node as Particles3D).billboard,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).billboard = Boolean(value);
          },
        },
        {
          name: 'emitterShape',
          type: 'enum',
          ui: { label: 'Emitter Shape', group: 'Emitter', options: ['point', 'sphere', 'box'] },
          getValue: (node: unknown) => (node as Particles3D).emitterShape,
          setValue: (node: unknown, value: unknown) => {
            const next = String(value) as ParticleEmitterShape;
            if (next === 'point' || next === 'sphere' || next === 'box') {
              (node as Particles3D).emitterShape = next;
            }
          },
        },
        {
          name: 'emitterRadius',
          type: 'number',
          ui: {
            label: 'Emitter Radius',
            group: 'Emitter',
            min: 0,
            max: 10,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).emitterRadius,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).emitterRadius = Math.max(0, Number(value));
          },
        },
        {
          name: 'emitterBoxSize',
          type: 'vector3',
          ui: { label: 'Emitter Box Size', group: 'Emitter', step: 0.01, precision: 2 },
          getValue: (node: unknown) => ({ ...(node as Particles3D).emitterBoxSize }),
          setValue: (node: unknown, value: unknown) => {
            const v = value as { x: number; y: number; z: number };
            (node as Particles3D).emitterBoxSize = {
              x: Math.max(0, Number(v.x)),
              y: Math.max(0, Number(v.y)),
              z: Math.max(0, Number(v.z)),
            };
          },
        },
        {
          name: 'emissionRate',
          type: 'number',
          ui: {
            label: 'Emission Rate',
            group: 'Emission',
            min: 0,
            max: 1000,
            step: 1,
            precision: 0,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).emissionRate,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).emissionRate = Math.max(0, Number(value));
          },
        },
        {
          name: 'maxParticles',
          type: 'number',
          ui: {
            label: 'Max Particles',
            group: 'Emission',
            min: 1,
            max: 10000,
            step: 1,
            precision: 0,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).maxParticles,
          setValue: (node: unknown, value: unknown) =>
            (node as Particles3D).setMaxParticles(Number(value)),
        },
        {
          name: 'lifetime',
          type: 'number',
          ui: {
            label: 'Lifetime',
            group: 'Emission',
            unit: 's',
            min: 0.01,
            max: 30,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).lifetime,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).lifetime = Math.max(0.01, Number(value));
          },
        },
        {
          name: 'speed',
          type: 'number',
          ui: {
            label: 'Speed',
            group: 'Emission',
            min: 0,
            max: 100,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).speed,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).speed = Math.max(0, Number(value));
          },
        },
        {
          name: 'speedSpread',
          type: 'number',
          ui: {
            label: 'Speed Spread',
            group: 'Emission',
            min: 0,
            max: 20,
            step: 0.01,
            precision: 2,
            slider: true,
          },
          getValue: (node: unknown) => (node as Particles3D).speedSpread,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).speedSpread = Math.max(0, Number(value));
          },
        },
        {
          name: 'gravity',
          type: 'vector3',
          ui: { label: 'Gravity', group: 'Emission', step: 0.01, precision: 2 },
          getValue: (node: unknown) => ({ ...(node as Particles3D).gravity }),
          setValue: (node: unknown, value: unknown) => {
            const v = value as { x: number; y: number; z: number };
            (node as Particles3D).gravity = { x: Number(v.x), y: Number(v.y), z: Number(v.z) };
          },
        },
        {
          name: 'disableRotation',
          type: 'boolean',
          ui: { label: 'Disable Rotation', group: 'Emission' },
          getValue: (node: unknown) => (node as Particles3D).disableRotation,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).disableRotation = Boolean(value);
          },
        },
        {
          name: 'playing',
          type: 'boolean',
          ui: { label: 'Playing', group: 'Runtime' },
          getValue: (node: unknown) => (node as Particles3D).playing,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).playing = Boolean(value);
          },
        },
        {
          name: 'loop',
          type: 'boolean',
          ui: { label: 'Loop', group: 'Runtime' },
          getValue: (node: unknown) => (node as Particles3D).loop,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).loop = Boolean(value);
          },
        },
        {
          name: 'prewarm',
          type: 'boolean',
          ui: { label: 'Prewarm', group: 'Runtime' },
          getValue: (node: unknown) => (node as Particles3D).prewarm,
          setValue: (node: unknown, value: unknown) => {
            (node as Particles3D).prewarm = Boolean(value);
          },
        },
        {
          name: 'preview',
          type: 'boolean',
          ui: { label: 'Preview', group: 'Runtime' },
          getValue: (node: unknown) => (node as Particles3D).preview,
          setValue: (node: unknown, value: unknown) => {
            const particles = node as Particles3D;
            const next = Boolean(value);
            if (particles.preview && !next) {
              particles.restart();
            }
            particles.preview = next;
          },
        },
        {
          name: 'simulationSpace',
          type: 'enum',
          ui: { label: 'Simulation Space', group: 'Runtime', options: ['local', 'world'] },
          getValue: (node: unknown) => (node as Particles3D).simulationSpace,
          setValue: (node: unknown, value: unknown) => {
            const next = String(value);
            if (next === 'local' || next === 'world') {
              (node as Particles3D).simulationSpace = next;
            }
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Rendering: {
          label: 'Rendering',
          description: 'Particle rendering settings',
          expanded: true,
        },
        Emitter: {
          label: 'Emitter',
          description: 'Emitter shape and spawn volume',
          expanded: true,
        },
        Emission: { label: 'Emission', description: 'Emission rates and movement', expanded: true },
        Runtime: { label: 'Runtime', description: 'Simulation runtime controls', expanded: true },
      },
    };
  }
}
