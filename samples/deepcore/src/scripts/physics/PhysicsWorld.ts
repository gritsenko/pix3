import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { type VoxelData } from '../world';
import { PHYSICS } from '../config';
import { BLOCK_PROPERTIES, GRID } from '../core/Types';

export interface PhysicsBody {
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh?: THREE.Object3D;
  blockData?: VoxelData;
  type: 'block' | 'droppable';
}

// Interface for wall configuration to share data between physics and visualization
interface WallConfig {
  name: string;
  position: { x: number; y: number; z: number };
  size: { width: number; height: number; depth: number };
}

export class PhysicsWorld {
  private world!: RAPIER.World;
  private bodies: Map<number, PhysicsBody> = new Map();
  private pendingRemovals: number[] = [];
  private initialized: boolean = false;

  // Store wall configs to use for both physics bodies and debug meshes
  private wallConfigs: WallConfig[] = [];

  // Debug visualization
  private wallHelpers: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;

  // Event callbacks
  public onBlockImpact: ((
    fallingBody: PhysicsBody,
    targetBody: PhysicsBody | null,
    velocity: number
  ) => void) | null = null;

  async init(scene: THREE.Scene): Promise<void> {
    await RAPIER.init();

    // Create physics world with gravity
    this.world = new RAPIER.World({ x: 0.0, y: PHYSICS.gravity, z: 0.0 });

    // Store scene reference for debug visualization
    this.scene = scene;

    // Calculate wall positions and sizes once
    this.calculateWallConfigs();

    // Create invisible walls based on the config
    this.createInvisibleWalls();

    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Calculate wall configurations to avoid duplication and ensure correct positioning
  private calculateWallConfigs(): void {
    const wallHeight = 20000;
    const wallThickness = 5;
    const wallY = 0; // Centered vertically

    // 0.5 is half the block size (distance from center to edge)
    const blockHalfSize = 0.5;
    const padding = 0.05; // Small margin to prevent droppables getting stuck

    // Exact boundaries of the playable voxel grid
    const boundMinX = GRID.minX - blockHalfSize - padding;
    const boundMaxX = GRID.maxX + blockHalfSize + padding;
    const boundMinZ = GRID.minZ - blockHalfSize - padding;
    const boundMaxZ = GRID.maxZ + blockHalfSize + padding;

    // Dimensions of the inner area
    const areaWidth = boundMaxX - boundMinX;
    const areaDepth = boundMaxZ - boundMinZ;

    // Offset is half the thickness. 
    // We shift the wall center OUTWARD by this amount so the inner face aligns with the boundary.
    const offset = wallThickness / 2;

    this.wallConfigs = [
      // Left wall (X min side)
      {
        name: 'left',
        position: {
          x: boundMinX - offset,
          y: wallY,
          z: (boundMinZ + boundMaxZ) / 2
        },
        size: {
          width: wallThickness,
          height: wallHeight,
          // Add thickness to depth to cover corners (overlap)
          depth: areaDepth + (wallThickness * 2)
        }
      },
      // Right wall (X max side)
      {
        name: 'right',
        position: {
          x: boundMaxX + offset,
          y: wallY,
          z: (boundMinZ + boundMaxZ) / 2
        },
        size: {
          width: wallThickness,
          height: wallHeight,
          depth: areaDepth + (wallThickness * 2)
        }
      },
      // Front wall (Z min side)
      {
        name: 'front',
        position: {
          x: (boundMinX + boundMaxX) / 2,
          y: wallY,
          z: boundMinZ - offset
        },
        size: {
          width: areaWidth, // Corners are covered by side walls
          height: wallHeight,
          depth: wallThickness
        }
      },
      // Back wall (Z max side)
      {
        name: 'back',
        position: {
          x: (boundMinX + boundMaxX) / 2,
          y: wallY,
          z: boundMaxZ + offset
        },
        size: {
          width: areaWidth,
          height: wallHeight,
          depth: wallThickness
        }
      },
    ];
  }

  // Create invisible walls to constrain movement based on pre-calculated config
  private createInvisibleWalls(): void {
    if (this.wallConfigs.length === 0) return;

    for (const config of this.wallConfigs) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(config.position.x, config.position.y, config.position.z);

      const rigidBody = this.world.createRigidBody(bodyDesc);

      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        config.size.width / 2,
        config.size.height / 2,
        config.size.depth / 2
      )
        .setRestitution(0.0)
        .setFriction(0.5);

      this.world.createCollider(colliderDesc, rigidBody);
    }
  }

  // Create a static collider for a block
  createStaticBlock(x: number, y: number, z: number, blockData: VoxelData): PhysicsBody {
    // Prevent duplicates at the same coordinate
    const existing = this.findBlockAt(x, y, z);
    if (existing) {
      this.removeBody(existing);
    }

    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(x, y, z);

    const rigidBody = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
      .setRestitution(0.1)
      .setFriction(0.8);

    const collider = this.world.createCollider(colliderDesc, rigidBody);

    const body: PhysicsBody = {
      rigidBody,
      collider,
      blockData,
      type: 'block',
    };

    this.bodies.set(rigidBody.handle, body);
    return body;
  }

  // Convert a static block to dynamic (falling)
  convertToDynamic(body: PhysicsBody): void {
    const translation = body.rigidBody.translation();

    // Remove old body
    this.removeBody(body);

    // Create new dynamic body
    // Increased damping significantly to prevent sliding (ice effect)
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(translation.x, translation.y, translation.z)
      .setLinearDamping(1.5)  // Increased from 0.1
      .setAngularDamping(1.5); // Increased from 0.5

    const rigidBody = this.world.createRigidBody(bodyDesc);

    // Set mass based on block density
    const density = body.blockData
      ? BLOCK_PROPERTIES[body.blockData.type].density
      : 1;

    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
      .setRestitution(0.0) // No bounce
      .setFriction(2.0)    // High friction to stop sliding
      .setDensity(density)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const collider = this.world.createCollider(colliderDesc, rigidBody);

    const newBody: PhysicsBody = {
      rigidBody,
      collider,
      blockData: body.blockData,
      mesh: body.mesh,
      type: 'block',
    };

    this.bodies.set(rigidBody.handle, newBody);
  }

  // Calculate ejection impulse direction based on free neighbors
  private calculateEjectionImpulse(x: number, y: number, z: number, strength: number): { x: number, y: number, z: number } {
    const directions = [
      { x: 0, y: 1, z: 0 },  // Up
      { x: 0, y: -1, z: 0 }, // Down
      { x: 1, y: 0, z: 0 },  // Right
      { x: -1, y: 0, z: 0 }, // Left
      { x: 0, y: 0, z: 1 },  // Front
      { x: 0, y: 0, z: -1 }, // Back
    ];

    let freeDirs: { x: number, y: number, z: number }[] = [];

    // Check all 6 neighbors to see which are free
    for (const dir of directions) {
      if (!this.findBlockAt(x + dir.x, y + dir.y, z + dir.z)) {
        freeDirs.push(dir);
      }
    }

    // If completely blocked or completely free, just go random/up
    if (freeDirs.length === 0) {
      return {
        x: (Math.random() - 0.5) * strength,
        y: strength,
        z: (Math.random() - 0.5) * strength
      };
    }

    // Sum free directions
    let impulse = { x: 0, y: 0, z: 0 };
    for (const dir of freeDirs) {
      impulse.x += dir.x;
      impulse.y += dir.y;
      impulse.z += dir.z;
    }

    // Normalize and scale to strength
    const len = Math.sqrt(impulse.x ** 2 + impulse.y ** 2 + impulse.z ** 2);
    if (len > 0.001) {
      impulse.x = (impulse.x / len) * strength;
      impulse.y = (impulse.y / len) * strength;
      impulse.z = (impulse.z / len) * strength;
    } else {
      // Fallback if vectors cancel out (e.g. only left and right are free)
      impulse.y = strength;
    }

    // Add some randomness to spread items out
    impulse.x += (Math.random() - 0.5) * (strength * 0.5);
    impulse.y += (Math.random() * 0.5); // Slight upward bias for bounce
    impulse.z += (Math.random() - 0.5) * (strength * 0.5);

    return impulse;
  }

  // Create a dynamic resource object (smaller cube, high friction/damping)
  createResource(x: number, y: number, z: number): PhysicsBody {
    // 1. Calculate impulse
    const impulse = this.calculateEjectionImpulse(x, y, z, 0.1);

    // 2. Normalize impulse for position offset
    const len = Math.sqrt(impulse.x ** 2 + impulse.y ** 2 + impulse.z ** 2);
    let offsetX = 0, offsetY = 0, offsetZ = 0;

    if (len > 0.001) {
      // Cuboid half extents are 0.12, so full size is 0.24
      // 0.5 (block half) + 0.12 (cuboid half) + margin = ~0.7
      const offsetScale = 0.8;
      offsetX = (impulse.x / len) * offsetScale;
      offsetY = (impulse.y / len) * offsetScale;
      offsetZ = (impulse.z / len) * offsetScale;
    } else {
      offsetY = 1.0;
    }

    // 3. Create body at OFFSET position
    // Very high damping to prevent sliding and rolling
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x + offsetX, y + offsetY, z + offsetZ)
      .setLinearDamping(3.0)
      .setAngularDamping(3.0)
      .setCcdEnabled(true);

    const rigidBody = this.world.createRigidBody(bodyDesc);

    // Small cuboid collider for resource (not sphere - prevents rolling)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.18, 0.18, 0.18)
      .setRestitution(0.1) // Low restitution
      .setFriction(0.5)    // Very high friction to prevent sliding
      .setDensity(0.5)
      .setCollisionGroups(0x00020002);

    const collider = this.world.createCollider(colliderDesc, rigidBody);

    // 4. Apply impulse
    rigidBody.applyImpulse(impulse, true);

    const body: PhysicsBody = {
      rigidBody,
      collider,
      type: 'droppable',
    };

    this.bodies.set(rigidBody.handle, body);
    return body;
  }

  // Backwards compatible wrapper for unified droppable items
  createDroppableItem(x: number, y: number, z: number): PhysicsBody {
    // Delegate to existing createResource which matches expected behaviour
    return this.createResource(x, y, z);
  }

  // Remove a body
  removeBody(body: PhysicsBody): void {
    this.bodies.delete(body.rigidBody.handle);
    this.world.removeRigidBody(body.rigidBody);
  }

  // Get body by handle
  getBody(handle: number): PhysicsBody | undefined {
    return this.bodies.get(handle);
  }

  // Find static block at position
  findBlockAt(x: number, y: number, z: number): PhysicsBody | undefined {
    for (const body of this.bodies.values()) {
      if (body.type === 'block' && body.blockData) {
        const pos = body.rigidBody.translation();
        if (
          Math.abs(pos.x - x) < 0.1 &&
          Math.abs(pos.y - y) < 0.1 &&
          Math.abs(pos.z - z) < 0.1
        ) {
          return body;
        }
      }
    }
    return undefined;
  }

  // Step physics simulation
  step(delta: number): void {
    if (!this.initialized || delta === 0) return;

    // Use a fixed time step or the passed delta
    // Rapier world.step() uses a default 1/60th if no params are given.
    // We want to ensure we don't step if the game is paused.

    // Step the simulation
    this.world.step();

    // Note: Collision events handled via velocity checks on dynamic bodies

    // Update mesh positions for dynamic bodies
    for (const body of this.bodies.values()) {
      if (body.mesh && body.rigidBody.isDynamic()) {
        const translation = body.rigidBody.translation();
        const rotation = body.rigidBody.rotation();

        body.mesh.position.set(translation.x, translation.y, translation.z);
        body.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

        // Check for impacts (high velocity collision)
        const linvel = body.rigidBody.linvel();
        const velocity = Math.sqrt(linvel.x ** 2 + linvel.y ** 2 + linvel.z ** 2);

        // Check if block has stopped falling
        if (body.type === 'block' && velocity < 0.1) {
          // Block has settled - could trigger additional logic
        }
      }
    }

    // Process pending removals
    for (const handle of this.pendingRemovals) {
      const body = this.bodies.get(handle);
      if (body) {
        this.removeBody(body);
      }
    }
    this.pendingRemovals = [];
  }

  // Get all dynamic bodies
  getDynamicBodies(): PhysicsBody[] {
    const result: PhysicsBody[] = [];
    for (const body of this.bodies.values()) {
      if (body.rigidBody.isDynamic()) {
        result.push(body);
      }
    }
    return result;
  }

  // Schedule body for removal
  scheduleRemoval(body: PhysicsBody): void {
    this.pendingRemovals.push(body.rigidBody.handle);
  }

  // Apply floating origin offset to all bodies
  applyFloatingOriginOffset(offset: number): void {
    for (const body of this.bodies.values()) {
      const translation = body.rigidBody.translation();
      body.rigidBody.setTranslation(
        { x: translation.x, y: translation.y - offset, z: translation.z },
        true
      );
    }
  }

  // Clear all bodies
  clear(): void {
    for (const body of this.bodies.values()) {
      this.world.removeRigidBody(body.rigidBody);
    }
    this.bodies.clear();
  }

  // Create debug visualization using the shared configuration
  createWallVisualization(): THREE.Group {
    if (this.wallHelpers) {
      return this.wallHelpers;
    }

    this.wallHelpers = new THREE.Group();
    this.wallHelpers.name = 'debug-walls';

    const wallMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });

    // Iterate over the shared configuration to create matching visual meshes
    for (const config of this.wallConfigs) {
      const geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.position.set(config.position.x, config.position.y, config.position.z);
      this.wallHelpers.add(mesh);
    }

    if (this.scene) {
      this.scene.add(this.wallHelpers);
    }

    return this.wallHelpers;
  }

  // Remove wall visualization
  removeWallVisualization(): void {
    if (this.wallHelpers && this.scene) {
      this.scene.remove(this.wallHelpers);

      this.wallHelpers.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });

      this.wallHelpers = null;
    }
  }

  // Rapier Debug Visualization
  private debugLines: THREE.LineSegments | null = null;

  updateDebugVisualization(enabled: boolean): void {
    if (!this.scene) return;

    if (!enabled) {
      if (this.debugLines) {
        this.scene.remove(this.debugLines);
        this.debugLines.geometry.dispose();
        (this.debugLines.material as THREE.Material).dispose();
        this.debugLines = null;
      }
      return;
    }

    const { vertices, colors } = this.world.debugRender();

    if (!this.debugLines) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        vertexColors: true
      });
      this.debugLines = new THREE.LineSegments(geometry, material);
      this.debugLines.name = 'physics-debug-lines';
      this.debugLines.frustumCulled = false;
      this.scene.add(this.debugLines);
    }

    const geometry = this.debugLines.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    // Flag attributes as needing update
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  // Dispose
  dispose(): void {
    this.clear();
  }
}