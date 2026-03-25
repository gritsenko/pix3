import * as THREE from 'three';
import { Cluster, ClusterBlock, BlockType, BLOCK_PROPERTIES, GameEvents, emitGameEvent } from '../core/Types';
import { RENDERER } from '../config';
import { VoxelWorld } from '../world';
import { physicsConfig } from '../config/physics';
import { ModelManager } from '../rendering/ModelManager';
import { HapticSystem } from './HapticSystem';

export class ClusterSystem {
  private clusters: Map<string, Cluster> = new Map();
  private scene: THREE.Scene;
  private voxelWorld: VoxelWorld;
  private clusterMeshes: Map<string, THREE.Group> = new Map();
  private destructionQueue: {
    x: number, y: number, z: number,
    type: BlockType,
    color: number,
    processTime: number
  }[] = [];

  constructor(scene: THREE.Scene, voxelWorld: VoxelWorld) {
    this.scene = scene;
    this.voxelWorld = voxelWorld;
  }

  createCluster(blocks: ClusterBlock[]): string {
    const id = Math.random().toString(36).substr(2, 9);

    // Calculate center of mass / average position
    const avgPos = new THREE.Vector3();
    let totalMass = 0;
    for (const b of blocks) {
      avgPos.x += b.gridX;
      avgPos.y += b.gridY;
      avgPos.z += b.gridZ;
      totalMass += BLOCK_PROPERTIES[b.type].mass;
    }
    avgPos.divideScalar(blocks.length);

    // Update local positions relative to the average position
    for (const b of blocks) {
      b.localX = b.gridX - avgPos.x;
      b.localY = b.gridY - avgPos.y;
      b.localZ = b.gridZ - avgPos.z;
    }

    const cluster: Cluster = {
      id,
      blocks,
      position: avgPos,
      velocity: 0,
      isLanding: false,
      totalMass,
      kineticEnergy: 0,
      startY: avgPos.y,
      fallDistance: 0
    };

    this.clusters.set(id, cluster);
    this.createClusterMesh(cluster);

    // Play transition animation (small jump/bounce on start)
    this.playTransitionAnimation(cluster);

    return id;
  }

  private playTransitionAnimation(cluster: Cluster): void {
    const config = physicsConfig.clusterFalling;
    const duration = config.bounceDuration * 0.5; // Shorter for start
    let elapsed = 0;

    const animateTransition = () => {
      // Safety check: skip if cluster was removed or landed
      if (!this.clusters.has(cluster.id) || cluster.isLanding) return;

      const mesh = this.clusterMeshes.get(cluster.id);
      if (!mesh) return;

      elapsed += 1 / 60;
      const t = Math.min(elapsed / duration, 1);

      // Upward jump: sin(PI * t)
      const offset = Math.sin(Math.PI * t) * (config.bounceHeight * 0.5);

      // Keep mesh position synced with current cluster progress + visual offset
      mesh.position.copy(cluster.position);
      mesh.position.y += offset;

      // Stop animation if page is hidden to save battery
      if (document.hidden) {
        mesh.position.copy(cluster.position);
        return;
      }

      if (t < 1) {
        requestAnimationFrame(animateTransition);
      } else {
        mesh.position.copy(cluster.position);
      }
    };

    requestAnimationFrame(animateTransition);
  }

  private createClusterMesh(cluster: Cluster): void {
    const group = new THREE.Group();
    group.position.copy(cluster.position);

    const meshesByType = new Map<BlockType, THREE.InstancedMesh>();
    const countsByType = new Map<BlockType, number>();
    const tempMatrix = new THREE.Matrix4();
    const tempRotation = new THREE.Matrix4();
    const tempEuler = new THREE.Euler();

    for (const block of cluster.blocks) {
      countsByType.set(block.type, (countsByType.get(block.type) ?? 0) + 1);
    }

    for (const [type, count] of countsByType) {
      const modelManager = ModelManager.getInstance();
      const resources = modelManager.createBlockRenderResources(type);
      const geometry = resources.geometry;
      const material = resources.material;
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.castShadow = RENDERER.clusterShadows;
      mesh.receiveShadow = RENDERER.clusterShadows;
      mesh.frustumCulled = false;

      const alphas = new Float32Array(count).fill(1.0);
      mesh.geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(alphas, 1));

      const flashes = new Float32Array(count).fill(0.0);
      mesh.geometry.setAttribute('instanceHitFlash', new THREE.InstancedBufferAttribute(flashes, 1));

      group.add(mesh);
      meshesByType.set(type, mesh);
      countsByType.set(type, 0);
    }

    for (const block of cluster.blocks) {
      const mesh = meshesByType.get(block.type);
      if (!mesh) continue;
      const instanceId = countsByType.get(block.type) ?? 0;

      // Calculate world position for deterministic rotation seed
      // Note: This logic must match VoxelRenderer to look consistent when cluster lands
      // The block.gridX/Y/Z are the world coordinates when the cluster was created.
      // However, if the cluster falls and lands elsewhere, does the rotation change?
      // "Random direction" usually implies some variance.
      // If we base it on world position, a block would rotate as it moves (if we used current pos).
      // But here we set initial local rotation.
      // Ideally, the rotation should stick to the block.
      // Since `Cluster` is transient, we should probably stick to the initial grid position for seed
      // OR just use the current position if we want it to "snap" to the grid rotation when it lands.
      // Given VoxelRenderer uses (x,y,z), if we want it to look like it *became* that block,
      // it should match the VoxelRenderer logic at the LANDING position.
      // But while falling, what rotation should it have? 
      // If it rotates 90deg, it should probably keep that rotation relative to the cluster?
      // Actually, if we use the ORIGINAL grid position (gridX, gridY, gridZ), it will match
      // the block that *was* there.
      // And when it lands, it becomes a new block at new coordinates.
      // If VoxelRenderer uses coordinate-based randomness, the texture/model will "change" rotation
      // if it moves to a new cell. This is often acceptable in voxel games (world-aligned textures).
      // Let's stick to world-aligned rotation based on the block's *current* (or initial) grid position.

      const props = BLOCK_PROPERTIES[block.type];
      tempMatrix.makeTranslation(block.localX, block.localY, block.localZ);

      if (props.randomRotation) {
        // Prefer rotation indices preserved on the cluster block (if available)
        if ((block as any).rotXIndex !== undefined && (block as any).rotYIndex !== undefined && (block as any).rotZIndex !== undefined) {
          const rotX = (block as any).rotXIndex * (Math.PI / 2);
          const rotY = (block as any).rotYIndex * (Math.PI / 2);
          const rotZ = (block as any).rotZIndex * (Math.PI / 2);
          tempEuler.set(rotX, rotY, rotZ);
          tempRotation.makeRotationFromEuler(tempEuler);
          tempMatrix.multiply(tempRotation);
        } else {
          // Fallback to world-position based seed (legacy behavior)
          const seed = Math.abs(Math.floor(block.gridX * 73856093) ^ Math.floor(block.gridY * 19349663) ^ Math.floor(block.gridZ * 83492791));
          const rotX = (seed % 4) * (Math.PI / 2);
          const rotY = (Math.floor(seed / 4) % 4) * (Math.PI / 2);
          const rotZ = (Math.floor(seed / 16) % 4) * (Math.PI / 2);
          tempEuler.set(rotX, rotY, rotZ);
          tempRotation.makeRotationFromEuler(tempEuler);
          tempMatrix.multiply(tempRotation);
        }
      }

      mesh.setMatrixAt(instanceId, tempMatrix);
      countsByType.set(block.type, instanceId + 1);
    }

    for (const mesh of meshesByType.values()) {
      mesh.instanceMatrix.needsUpdate = true;
    }

    this.scene.add(group);
    this.clusterMeshes.set(cluster.id, group);
  }

  update(deltaTime: number): void {
    const config = physicsConfig.clusterFalling;
    const now = performance.now();

    // 1. Process destruction queue (Phase 5)
    this.processDestructionQueue(now);

    for (const [id, cluster] of this.clusters) {
      if (cluster.isLanding) continue;

      // Update falling progress
      const fallAmount = config.fallSpeed * deltaTime;
      cluster.position.y -= fallAmount;
      cluster.fallDistance += fallAmount;
      cluster.velocity = config.fallSpeed;

      // 2. Lateral Failure Check (Phase 3)
      this.calculateInertiaStress(cluster);

      // 3. Check for landing
      const landingY = this.calculateLandingY(cluster);

      if (cluster.position.y <= landingY) {
        cluster.position.y = landingY;
        const mesh = this.clusterMeshes.get(id);
        if (mesh) mesh.position.copy(cluster.position);

        // Calculate Energy on impact (Phase 4)
        // Scaled exponentially with fall distance: TotalMass * Multiplier * (1.6 ^ Distance)
        // Base 1.6 ensures DIRT (mass 1) falling 2 blocks destroys DIRT (HP 20)
        cluster.kineticEnergy = cluster.totalMass * config.impactDamageMultiplier * Math.pow(1.6, cluster.fallDistance);

        this.handleLanding(cluster);
      } else {
        const mesh = this.clusterMeshes.get(id);
        if (mesh) mesh.position.copy(cluster.position);
      }
    }
  }

  private calculateInertiaStress(cluster: Cluster): void {
    if (cluster.blocks.length <= 1) return;

    const blockMap = new Map<string, ClusterBlock>();
    for (const b of cluster.blocks) {
      // Use integer keys for the map to stay safe
      const lx = Math.round(b.localX);
      const ly = Math.round(b.localY);
      const lz = Math.round(b.localZ);
      blockMap.set(`${lx},${ly},${lz}`, b);
    }

    const detachedIndices: number[] = [];
    for (let i = 0; i < cluster.blocks.length; i++) {
      const b = cluster.blocks[i];
      const lx = Math.round(b.localX);
      const ly = Math.round(b.localY);
      const lz = Math.round(b.localZ);

      const hasTop = blockMap.has(`${lx},${ly + 1},${lz}`);
      const hasBottom = blockMap.has(`${lx},${ly - 1},${lz}`);

      // "Hanging" block: no vertical support, only side neighbors
      if (!hasTop && !hasBottom) {
        const props = BLOCK_PROPERTIES[b.type];
        const inertiaForce = props.mass * cluster.velocity;

        // Threshold check: GripForce determines how much inertia the block can take
        if (inertiaForce > props.gripForce * 15) { // 15 is a sensitivity scaler
          detachedIndices.push(i);
        }
      }
    }

    if (detachedIndices.length > 0 && detachedIndices.length < cluster.blocks.length) {
      // Split into new cluster
      const detachedBlocks = detachedIndices.map(idx => cluster.blocks[idx]);

      // Update original cluster
      cluster.blocks = cluster.blocks.filter((_, idx) => !detachedIndices.includes(idx));
      cluster.totalMass = cluster.blocks.reduce((sum, b) => sum + BLOCK_PROPERTIES[b.type].mass, 0);

      // Update mesh of original cluster
      this.rebuildClusterMesh(cluster);

      // Create new cluster for detached pieces
      // We need to translate local positions to world positions before creating
      const newClusterBlocks = detachedBlocks.map(b => ({
        ...b,
        gridX: cluster.position.x + b.localX,
        gridY: cluster.position.y + b.localY,
        gridZ: cluster.position.z + b.localZ
      }));

      this.createCluster(newClusterBlocks);
    }
  }

  private rebuildClusterMesh(cluster: Cluster): void {
    const oldMesh = this.clusterMeshes.get(cluster.id);
    if (oldMesh) {
      this.scene.remove(oldMesh);
      this.disposeClusterGroup(oldMesh);
    }
    this.createClusterMesh(cluster);
  }

  private disposeClusterGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if ((obj.geometry as THREE.BufferGeometry).userData?.isInstancedClone) {
        obj.geometry.dispose();
      }
      if (Array.isArray(obj.material)) {
        obj.material.forEach((material) => material.dispose());
      } else {
        obj.material.dispose();
      }
    });
  }

  private processImpactEnergy(cluster: Cluster): void {
    const columns = new Map<string, ClusterBlock[]>();
    for (const b of cluster.blocks) {
      const key = `${Math.round(b.localX)},${Math.round(b.localZ)}`;
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key)!.push(b);
    }

    const energyPerColumn = cluster.kineticEnergy / (columns.size || 1);

    for (const [key, columnBlocks] of columns) {
      columnBlocks.sort((a, b) => a.localY - b.localY);

      const [lx, lz] = key.split(',').map(Number);
      const worldX = Math.floor(cluster.position.x + lx) + 0.5;
      const worldZ = Math.floor(cluster.position.z + lz) + 0.5;
      const groundY = Math.round(cluster.position.y + columnBlocks[0].localY) - 1;
      const bottomImpactor = columnBlocks[0];

      let columnEnergy = energyPerColumn;

      // 1. Shockwave DOWN into the world
      let currentWorldY = groundY;
      let steps = 0;
      const MAX_STEPS = 10; // Prevent infinite drilling

      while (columnEnergy > 1 && steps < MAX_STEPS) { // Stop if energy is negligible
        steps++;
        const target = this.voxelWorld.getBlock(worldX, currentWorldY, worldZ);
        if (!target || target.type === BlockType.AIR) break;
        if (target.type === BlockType.BEDROCK) break;

        const targetProps = BLOCK_PROPERTIES[target.type];
        const impactorProps = BLOCK_PROPERTIES[columnBlocks[0].type];

        // Damage = Energy * impactForce / hardness
        let damage = (columnEnergy * impactorProps.impactForce) / (targetProps.hardness || 1);

        if (target.type === BlockType.DIRT && bottomImpactor.soilBreakthroughUsed) {
          const maxSafeDamage = Math.max(0, target.hp - 0.01);
          damage = Math.min(damage, maxSafeDamage);
        }

        const result = this.voxelWorld.damageBlock(worldX, currentWorldY, worldZ, damage, undefined, 'clusterImpact');

        if (target.type === BlockType.DIRT && result.destroyed && !bottomImpactor.soilBreakthroughUsed) {
          bottomImpactor.soilBreakthroughUsed = true;
        }

        // Energy dissipation - ensure minimal loss to prevent infinite loops
        const lossFactor = Math.max(0.1, targetProps.energyAbsorption);
        columnEnergy -= (damage + columnEnergy * lossFactor);

        if (!result.destroyed) break;
        currentWorldY--;
      }

      // 2. Shockwave UP into the cluster
      let upEnergy = energyPerColumn;
      let upSteps = 0;

      for (const b of columnBlocks) {
        if (upEnergy <= 1 || upSteps++ > MAX_STEPS) break;

        const bProps = BLOCK_PROPERTIES[b.type];
        // SelfDamage = RemainingEnergy * Block.fragility
        const damage = upEnergy * bProps.fragility;

        if (damage > 0.5) {
          emitGameEvent(GameEvents.BLOCK_DAMAGED, {
            x: worldX,
            y: cluster.position.y + b.localY, // Use real current Y position
            z: worldZ,
            damage: damage,
            previousHp: b.hp,
            remainingHp: Math.max(0, b.hp - damage),
            blockType: b.type,
            source: 'clusterImpact',
          });
        }

        b.hp -= damage;

        // Dissipate energy
        const lossFactor = Math.max(0.1, bProps.energyAbsorption);
        upEnergy -= (damage + upEnergy * lossFactor);

        if (b.hp > 0) break;
      }
    }
  }

  private processDestructionQueue(now: number): void {
    while (this.destructionQueue.length > 0 && this.destructionQueue[0].processTime <= now) {
      const event = this.destructionQueue.shift()!;

      // Visual feedback via events
      emitGameEvent(GameEvents.BLOCK_DAMAGED, {
        x: event.x, y: event.y, z: event.z,
        damage: 999,
        previousHp: 999,
        remainingHp: 0,
        blockType: event.type,
        source: 'clusterImpact',
      });

      // Spawn particles
      emitGameEvent(GameEvents.BLOCK_DESTROYED, {
        x: event.x, y: event.y, z: event.z,
        blockType: event.type,
        droppedQuantity: 0, // Simplified for physics destruction
        source: 'clusterImpact',
      });

      // Clear the block in world if it was placed (though usually we just don't place it)
    }
  }

  private calculateLandingY(cluster: Cluster): number {
    let maxLandingY = -2000;

    const lowestBlockByColumn = new Map<string, ClusterBlock>();

    for (const block of cluster.blocks) {
      const key = `${Math.round(block.localX)},${Math.round(block.localZ)}`;
      const existing = lowestBlockByColumn.get(key);
      if (!existing || block.localY < existing.localY) {
        lowestBlockByColumn.set(key, block);
      }
    }

    for (const block of lowestBlockByColumn.values()) {
      const worldX = Math.floor(cluster.position.x + block.localX) + 0.5;
      const worldZ = Math.floor(cluster.position.z + block.localZ) + 0.5;
      const startCheckY = Math.round(cluster.position.y + block.localY) - 1;

      let blockLandingY = -1000;
      for (let y = startCheckY; y > -1000; y--) {
        const voxel = this.voxelWorld.getBlock(worldX, y, worldZ);
        if (voxel && voxel.type !== BlockType.AIR) {
          blockLandingY = y + 1;
          break;
        }
      }

      const landingPosForClusterCenter = blockLandingY - block.localY;
      maxLandingY = Math.max(maxLandingY, landingPosForClusterCenter);
    }

    return maxLandingY;
  }

  private handleLanding(cluster: Cluster): void {
    cluster.isLanding = true;

    // Phase 4: Calculate impact energy transmission
    this.processImpactEnergy(cluster);

    // Trigger Camera Shake on impact (Phase 5)
    emitGameEvent(GameEvents.CAMERA_SHAKE, { intensity: Math.min(0.25, cluster.kineticEnergy / 300) });

    // Trigger haptic feedback on block landing
    HapticSystem.blockLanding();

    const mesh = this.clusterMeshes.get(cluster.id);
    if (!mesh) return;

    mesh.position.copy(cluster.position);

    // Apply bounce tween
    this.playBounceAnimation(cluster, () => {
      this.finalizeLanding(cluster);
    });
  }

  private playBounceAnimation(cluster: Cluster, onComplete: () => void): void {
    const config = physicsConfig.clusterFalling;
    const duration = config.bounceDuration;
    let elapsed = 0;

    const animate = () => {
      // Safety check: skip if cluster was removed or is no longer landing
      if (!this.clusters.has(cluster.id)) return;

      const mesh = this.clusterMeshes.get(cluster.id);
      if (!mesh) return;

      elapsed += 1 / 60; // Assuming 60fps for simple manual tween
      const t = Math.min(elapsed / duration, 1);

      // Simple bounce out formula: 
      // We want to go up and back down
      // sin(PI * t) goes 0 -> 1 -> 0
      const offset = Math.sin(Math.PI * t) * config.bounceHeight;

      // Always sync with current cluster position (important for floating origin)
      mesh.position.copy(cluster.position);
      mesh.position.y += offset;

      // Stop animation if page is hidden to save battery
      if (document.hidden) {
        mesh.position.copy(cluster.position);
        return;
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        mesh.position.copy(cluster.position);
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }

  private finalizeLanding(cluster: Cluster): void {
    // Phase 5: Group blocks by Y level for sequential destruction queue
    const layerDelay = 50; // ms per Y level
    const now = performance.now();

    // Find min Y in cluster for relative delay calculation
    let minY = Infinity;
    for (const b of cluster.blocks) {
      if (b.localY < minY) minY = b.localY;
    }

    const survivingBlocks: {
      block: ClusterBlock;
      worldX: number;
      worldY: number;
      worldZ: number;
      key: string;
      belowKey: string;
    }[] = [];

    for (const block of cluster.blocks) {
      const worldX = Math.floor(cluster.position.x + block.localX) + 0.5;
      const worldY = Math.round(cluster.position.y + block.localY);
      const worldZ = Math.floor(cluster.position.z + block.localZ) + 0.5;

      if (block.hp <= 0) {
        // Block destroyed on impact: added to destruction queue
        const delay = Math.max(0, (block.localY - minY) * layerDelay);
        this.destructionQueue.push({
          x: worldX,
          y: worldY,
          z: worldZ,
          type: block.type,
          color: BLOCK_PROPERTIES[block.type].color,
          processTime: now + delay
        });
      } else {
        survivingBlocks.push({
          block,
          worldX,
          worldY,
          worldZ,
          key: `${worldX},${worldY},${worldZ}`,
          belowKey: `${worldX},${worldY - 1},${worldZ}`,
        });
      }
    }

    survivingBlocks.sort((a, b) => a.worldY - b.worldY);

    const settledBlocks: typeof survivingBlocks = [];
    const cascadingBlocks: ClusterBlock[] = [];
    const settledKeys = new Set<string>();

    for (const entry of survivingBlocks) {
      const supportVoxel = this.voxelWorld.getBlock(entry.worldX, entry.worldY - 1, entry.worldZ);
      const hasWorldSupport = !!supportVoxel && supportVoxel.type !== BlockType.AIR;
      const hasSettledSupport = settledKeys.has(entry.belowKey);

      if (hasWorldSupport || hasSettledSupport) {
        settledBlocks.push(entry);
        settledKeys.add(entry.key);
      } else {
        cascadingBlocks.push({
          ...entry.block,
          droppableItems: new Map(entry.block.droppableItems),
          gridX: entry.worldX,
          gridY: entry.worldY,
          gridZ: entry.worldZ,
          localX: 0,
          localY: 0,
          localZ: 0,
          soilBreakthroughUsed: entry.block.soilBreakthroughUsed,
          unstableHitCount: entry.block.unstableHitCount,
          unstableHeat: entry.block.unstableHeat,
        });
      }
    }

    for (const entry of settledBlocks) {
      const { block, worldX, worldY, worldZ } = entry;

      this.voxelWorld.setBlockFromData({
        x: worldX,
        y: worldY,
        z: worldZ,
        type: block.type,
        hp: block.hp,
        initialHp: block.initialHp,
        droppableItems: new Map(block.droppableItems),
        isStatic: true,
        // Preserve rotation indices from cluster block
        rotXIndex: (block as any).rotXIndex,
        rotYIndex: (block as any).rotYIndex,
        rotZIndex: (block as any).rotZIndex,
        unstableHitCount: block.unstableHitCount,
        unstableHeat: block.unstableHeat,
      });

      // Trigger stability check for landing area
      emitGameEvent(GameEvents.STABILITY_CHECK, { x: worldX, y: worldY, z: worldZ });
    }

    // Emit cluster landed event
    emitGameEvent(GameEvents.CLUSTER_LANDED, {
      blocks: settledBlocks.map(entry => entry.block),
      landingY: cluster.position.y
    });


    // Clean up cluster mesh and data
    const mesh = this.clusterMeshes.get(cluster.id);
    if (mesh) {
      this.scene.remove(mesh);
      this.disposeClusterGroup(mesh);
      this.clusterMeshes.delete(cluster.id);
    }
    this.clusters.delete(cluster.id);

    if (cascadingBlocks.length > 0) {
      this.createCluster(cascadingBlocks);
    }
  }

  applyFloatingOriginOffset(offset: number): void {
    if (offset === 0) return;
    for (const cluster of this.clusters.values()) {
      cluster.position.y -= offset;
      const mesh = this.clusterMeshes.get(cluster.id);
      if (mesh) mesh.position.copy(cluster.position);
    }
  }
}
