import * as THREE from 'three';
import { VoxelWorld } from '../world';
import { type BotEntity, type BotConfig, BlockType, GRID } from '../core/Types';

type PathNode = {
  pos: THREE.Vector3;
  parent: PathNode | null;
};

export class BotNavigation {
  private static readonly UNREACHABLE_MARKER_KEY = 'botUnreachableUntil';
  private bot: BotEntity;
  private voxelWorld: VoxelWorld;
  private config: BotConfig;
  private previousPosition: THREE.Vector3;
  private stuckDetectionTimer: number;
  private velocity: THREE.Vector3;
  private lastSupportState: boolean;
  private supportConfirmationFrames: number;
  private stateTransitionDebounce: number;
  private lastGroundedY: number;
  private landedFrame: number;
  private groundLockTimer: number;
  private justLanded: boolean;
  private path: THREE.Vector3[] = [];
  private pathIndex: number = 0;
  private pathRetryTimer: number = 0;
  private pathFailureCount: number = 0;
  private currentPathTargetKey: string | null = null;
  private logThrottle: Map<string, number> = new Map();
  
  constructor(bot: BotEntity, voxelWorld: VoxelWorld, config: BotConfig) {
    this.bot = bot;
    this.voxelWorld = voxelWorld;
    this.config = config;
    this.previousPosition = new THREE.Vector3();
    this.stuckDetectionTimer = 0;
    this.velocity = new THREE.Vector3();
    this.lastSupportState = false;
    this.supportConfirmationFrames = 0;
    this.stateTransitionDebounce = 0;
    this.lastGroundedY = bot.state.position.y;
    this.landedFrame = 0;
    this.groundLockTimer = 0;
    this.justLanded = false;
    
    // Initialize previous position
    this.previousPosition.copy(bot.state.position);
    this.path = [];
    this.pathIndex = 0;
    this.pathRetryTimer = 0;
    this.pathFailureCount = 0;
    this.currentPathTargetKey = null;
  }

  update(deltaTime: number): void {
    if (this.bot.isBeingDragged) {
        this.resetStuckDetection();
        return;
    }

    // Update stuck detection
    this.updateStuckDetection(deltaTime);
    
    // Update debounce timer
    this.stateTransitionDebounce = Math.max(0, this.stateTransitionDebounce - deltaTime);
    
    // Update ground lock timer
    this.groundLockTimer = Math.max(0, this.groundLockTimer - deltaTime);
    this.pathRetryTimer = Math.max(0, this.pathRetryTimer - deltaTime);
    
    // If currently landing, update landing counter
    if (this.bot.state.isLanding) {
      this.landedFrame = 0;
      this.justLanded = false;
    } else if (!this.bot.isFalling) {
      this.landedFrame++;
      // Clear just landed flag after a brief period
      if (this.landedFrame > 10) {
        this.justLanded = false;
      }
    }

    // --- RESOURCE PATHFINDING & MOVEMENT ---
    // If bot has no path, try to find a target and path to it
    if (!this.path.length) {
      let targetPos: THREE.Vector3 | null = null;
      
      // Priority 1: Check for itemTarget (dropped item set by state machine)
      if (this.bot.state.itemTarget) {
        targetPos = this.getItemTargetPosition(this.bot.state.itemTarget);
      } 
      // Priority 2: Search for resource blocks in voxel world
      else {
        targetPos = this.findClosestResourceSurface();
      }
      
      if (targetPos && this.pathRetryTimer <= 0) {
        const targetKey = this.getTargetKey(targetPos);
        if (targetKey !== this.currentPathTargetKey) {
          this.currentPathTargetKey = targetKey;
          this.pathFailureCount = 0;
        }

        this.path = this.findSurfacePath(this.bot.state.position, targetPos);

        if (this.path.length > 0) {
          this.pathIndex = 0;
          this.pathFailureCount = 0;
          this.pathRetryTimer = 0;
          this.resetStuckDetection(); // Reset stuck state when starting new path
          this.supportConfirmationFrames = 0; // Reset support detection to prevent immediate fall
          this.logNavigation('path-created', 750, {
            waypoints: this.path.length,
            target: targetPos.toArray()
          });
        } else {
          this.pathFailureCount++;
          this.pathRetryTimer = this.config.navigation.pathRetryCooldown;

          const itemTarget = this.bot.state.itemTarget;
          if (itemTarget && this.pathFailureCount >= this.config.navigation.maxPathRetries) {
            this.markItemTargetUnreachable(itemTarget);
            this.bot.state.itemTarget = undefined;
            this.bot.state.target = undefined;
            this.resetPathRetryState();
            this.logError('target-unreachable', 1500, {
              position: targetPos.toArray()
            });
          } else {
            this.logNavigation('path-not-found', 1200, {
              attempt: this.pathFailureCount,
              target: targetPos.toArray()
            });
          }
        }
      }
    }
    
    // If path exists, follow it
    if (this.path.length) {
      const nextWaypoint = this.path[this.pathIndex];
      if (nextWaypoint) {
        // Move towards next waypoint
        const dist = this.bot.state.position.distanceTo(nextWaypoint);
        
        // For final waypoint (resource position), use very small threshold to get bot right on target
        // Regular waypoints use larger threshold for smoother pathfinding
        const isFinalWaypoint = this.pathIndex === this.path.length - 1;
        const arrivalThreshold = isFinalWaypoint ? 0.08 : 0.35;
        
        if (dist <= arrivalThreshold) {
          // Arrived at waypoint
          this.pathIndex++;
          if (this.pathIndex >= this.path.length) {
            // Arrived at target - clear path so state machine can handle collection
            this.path = [];
            this.pathIndex = 0;
            this.resetPathRetryState();
          }
        } else {
          // Set as position target for movement
          this.bot.state.target = { x: nextWaypoint.x, y: nextWaypoint.y, z: nextWaypoint.z, blockType: BlockType.DIRT }; // blockType is a placeholder, not used for movement
        }
      }
    }
    
    // Check for support with hysteresis
    const support = this.findSupport();
    const hasSupport = support !== null;
    
    // Hysteresis: require confirmation over multiple frames
    if (hasSupport === this.lastSupportState) {
      this.supportConfirmationFrames++;
    } else {
      this.supportConfirmationFrames = 0;
    }
    this.lastSupportState = hasSupport;
    
    // Require at least 3 frames of NO support before falling (stronger threshold to exit ground)
    // If grounded and just landed, lock for at least 5 frames
    const minFramesForFalling = this.landedFrame < 5 ? 5 : 3;
    const confirmedSupport = this.supportConfirmationFrames >= 1 && support !== null ? support : null;
    const shouldBeFalling = this.supportConfirmationFrames >= minFramesForFalling && support === null && this.groundLockTimer <= 0 && !this.justLanded;
    
    if (confirmedSupport && !this.bot.state.isLanding) {
      this.bot.isFalling = false;
      this.bot.state.fallingTimer = 0;
      this.bot.state.surfaceNormal.copy(confirmedSupport.normal);
      
      // Snap Y position to grid to prevent drift, using localized surface height
      const surfaceY = this.findSurfaceHeight(this.bot.state.position.x, this.bot.state.position.z, this.bot.state.position.y);
      if (surfaceY !== null && Math.abs(surfaceY - this.bot.state.position.y) < 1.1) {
        this.bot.state.position.y = surfaceY;
      }
      this.lastGroundedY = this.bot.state.position.y;
      
      // Apply movement
      this.applyMovement(deltaTime);
    } else if (this.path.length > 0 && this.bot.state.target && !this.bot.state.isLanding) {
      // SPECIAL CASE: When following a path, allow movement even without perfect support
      // The pathfinding algorithm already verified these positions are reachable
      this.applyMovement(deltaTime);
      
      // If we've been without support for too long, start falling
      if (this.supportConfirmationFrames > 60) { // ~1 second at 60fps
        this.handleFalling(deltaTime);
        this.path = []; // Clear path when falling
        this.pathIndex = 0;
        this.pathRetryTimer = this.config.navigation.pathRetryCooldown;
      }
    } else if (this.bot.isFalling) {
      // Already falling, continue falling
      this.handleFalling(deltaTime);
    } else if (shouldBeFalling && this.stateTransitionDebounce <= 0) {
      // Not falling yet, but should start - AND debounce timer expired
      this.handleFalling(deltaTime);
    } else if (!this.bot.state.isLanding && !this.bot.isFalling && this.groundLockTimer > 0) {
      // Grounded with active ground lock - lock Y position
      this.bot.state.position.y = this.lastGroundedY;
      this.velocity.set(0, 0, 0);
    } else if (!this.bot.state.isLanding && !this.bot.isFalling) {
      // Grounded but support is flaky - hold position
      this.velocity.set(0, 0, 0);
    }
  }

  private getItemTargetPosition(itemTarget: THREE.Object3D): THREE.Vector3 {
    const itemRef = itemTarget.userData?.droppableItemRef as
      | { physicsBody?: { rigidBody: { translation: () => { x: number; y: number; z: number } } } }
      | undefined;

    if (itemRef?.physicsBody) {
      const pos = itemRef.physicsBody.rigidBody.translation();
      return new THREE.Vector3(pos.x, pos.y, pos.z);
    }

    const fallback = new THREE.Vector3();
    itemTarget.getWorldPosition(fallback);
    return fallback;
  }

  private getTargetKey(target: THREE.Vector3): string {
    return `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
  }

  private resetPathRetryState(): void {
    this.pathFailureCount = 0;
    this.pathRetryTimer = 0;
    this.currentPathTargetKey = null;
  }

  private markItemTargetUnreachable(itemTarget: THREE.Object3D): void {
    itemTarget.userData[BotNavigation.UNREACHABLE_MARKER_KEY] =
      performance.now() + this.config.navigation.unreachableTargetCooldown * 1000;
  }

  private logNavigation(event: string, throttleMs: number, details?: Record<string, unknown>): void {
    if (!this.config.debug.logNavigation) {
      return;
    }

    const now = performance.now();
    const lastLoggedAt = this.logThrottle.get(event) ?? 0;
    if (now - lastLoggedAt < throttleMs) {
      return;
    }

    this.logThrottle.set(event, now);
    if (details) {
      console.log('[BotNav]', event, details);
      return;
    }

    console.log('[BotNav]', event);
  }

  private logError(event: string, throttleMs: number, details?: Record<string, unknown>): void {
    if (!this.config.debug.logErrors) {
      return;
    }

    const now = performance.now();
    const key = `error:${event}`;
    const lastLoggedAt = this.logThrottle.get(key) ?? 0;
    if (now - lastLoggedAt < throttleMs) {
      return;
    }

    this.logThrottle.set(key, now);
    if (details) {
      console.warn('[BotNav]', event, details);
      return;
    }

    console.warn('[BotNav]', event);
  }

  private findSupport(): { normal: THREE.Vector3; position: THREE.Vector3 } | null {
    const pos = this.bot.state.position;
    const radius = this.config.navigation.sphereRadius + 0.25;
    
    // 1. Always prioritize floor support - scan downward to find actual floor
    // Start from a bit below the bot and scan down to find solid ground
    const checkStartY = pos.y - radius;
    const checkEndY = pos.y - radius - 50.0; // Scan down 50 units to find floor even when bot is high up
    
    for (let checkY = checkStartY; checkY >= checkEndY; checkY -= 0.5) {
      const floorBlock = this.voxelWorld.getBlock(pos.x, checkY, pos.z);
      if (floorBlock && floorBlock.type > BlockType.AIR) {
        // Found a solid block - this is our floor
        const floorBlockY = Math.floor(checkY);
        return {
          normal: new THREE.Vector3(0, 1, 0),
          position: new THREE.Vector3(Math.floor(pos.x) + 0.5, floorBlockY, Math.floor(pos.z) + 0.5)
        };
      }
    }

    // 2. Check walls - only if we have no floor support OR if target is inaccessible via floor
    const directions = [
      new THREE.Vector3(1, 0, 0),  // Right wall
      new THREE.Vector3(-1, 0, 0), // Left wall
      new THREE.Vector3(0, 0, 1),  // Front wall
      new THREE.Vector3(0, 0, -1), // Back wall
      new THREE.Vector3(0, 1, 0),  // Ceiling
    ];
    
    for (const dir of directions) {
      const checkPos = pos.clone().add(dir.clone().multiplyScalar(radius));
      // Optimization: if we're checking a wall, ensure we're not just hitting the side of the block under us
      if (Math.abs(dir.y) < 0.1 && Math.floor(checkPos.y) === Math.floor(pos.y - radius)) {
          // If we are at the same Y level as our potential floor, check if it's actually a different block in XZ
          if (Math.floor(checkPos.x) === Math.floor(pos.x) && Math.floor(checkPos.z) === Math.floor(pos.z)) {
              continue;
          }
      }

      const block = this.voxelWorld.getBlock(checkPos.x, checkPos.y, checkPos.z);
      
      if (block && block.type > BlockType.AIR) {
        return {
          normal: dir.clone().multiplyScalar(-1),
          position: new THREE.Vector3(Math.floor(checkPos.x) + 0.5, Math.floor(checkPos.y), Math.floor(checkPos.z) + 0.5)
        };
      }
    }
    
    return null;
  }

  private handleFalling(deltaTime: number): void {
    if (!this.bot.isFalling) {
      // Debounce falling state entry to prevent oscillation
      if (this.stateTransitionDebounce <= 0) {
        this.bot.isFalling = true;
        this.bot.state.isLanding = false;
        this.bot.state.fallingTimer = 0;
        // Reset normal when falling
        this.bot.state.surfaceNormal.set(0, 1, 0);
        this.stateTransitionDebounce = 0.1; // 100ms debounce
      }
      return;
    }
    
    this.bot.state.fallingTimer += deltaTime;
    
    const floorY = this.findSurfaceHeight(this.bot.state.position.x, this.bot.state.position.z);
    
    if (this.bot.state.isLanding) {
      // Instantly snap to floor - no bounce animation
      if (floorY !== null) {
        this.bot.state.position.y = floorY;
        this.lastGroundedY = floorY;
      }
      this.bot.isFalling = false;
      this.bot.state.isLanding = false;
      // Lock ground for 0.5s to prevent flickering
      this.groundLockTimer = 0.5;
      this.justLanded = true;
      // Extended debounce after landing
      this.stateTransitionDebounce = 0.3;
    } else {
      // Simple gravity fall
      const gravity = 20.0;
      const fallVelocity = gravity * this.bot.state.fallingTimer;
      this.bot.state.position.y -= fallVelocity * deltaTime;
      
      if (floorY !== null && this.bot.state.position.y <= floorY) {
        // Start landing sequence
        this.bot.state.position.y = floorY;
        this.bot.state.isLanding = true;
        this.bot.state.fallingTimer = 0;
      }
      
      this.velocity.set(0, -fallVelocity, 0);
    }
    
    // Horizontal bounds check
    this.bot.state.position.x = Math.max(GRID.minX, Math.min(GRID.maxX, this.bot.state.position.x));
    this.bot.state.position.z = Math.max(GRID.minZ, Math.min(GRID.maxZ, this.bot.state.position.z));
  }

  private updateStuckDetection(deltaTime: number): void {
    const itemTarget = this.bot.state.itemTarget;
    
    // Don't detect stuck while following a path - pathfinding handles navigation
    if (this.path.length > 0) {
      this.stuckDetectionTimer = 0;
      this.bot.isStuck = false;
      this.previousPosition.copy(this.bot.state.position);
      return;
    }
    
    if (!itemTarget || this.bot.isBeingDragged || this.bot.isFalling) {
      this.stuckDetectionTimer = 0;
      this.bot.isStuck = false;
      this.previousPosition.copy(this.bot.state.position);
      return;
    }

    const movementDistance = this.bot.state.position.distanceTo(this.previousPosition);
    
    if (movementDistance < 0.001) {
      this.stuckDetectionTimer += deltaTime;
    } else {
      this.stuckDetectionTimer = 0;
      this.bot.isStuck = false;
    }
    
    if (this.stuckDetectionTimer >= this.config.navigation.stuckDetectionTime) {
      if (!this.bot.isStuck) {
        this.bot.isStuck = true;
      }
    }
    
    this.previousPosition.copy(this.bot.state.position);
  }

  private applyMovement(deltaTime: number): void {
    // Don't move during landing phase to prevent re-triggering falling
    if (this.bot.state.isLanding) {
      this.velocity.set(0, 0, 0);
      return;
    }
    
    if (this.bot.isStuck) {
      this.velocity.set(0, 0, 0);
      return;
    }
    
    // Check for either itemTarget (mesh) or target (position-based)
    const posTarget = this.bot.state.target;
    if (!posTarget) {
      this.velocity.set(0, 0, 0);
      return;
    }
    // Convert to THREE.Vector3 for movement
    const posTargetVec = new THREE.Vector3(posTarget.x, posTarget.y, posTarget.z);
    this.moveToPosition(posTargetVec, deltaTime);
  }

  // --- PATHFINDING & RESOURCE LOGIC ---
  // Find the closest resource by traversing block/wall surfaces (BFS)
  private findClosestResourceSurface(): THREE.Vector3 | null {
    // For demo: scan a radius and return the first resource found on a surface
    // Replace this with your actual resource detection logic
    const searchRadius = 8;
    const botPos = this.bot.state.position.clone();
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        for (let dz = -searchRadius; dz <= searchRadius; dz++) {
          for (let dy = -2; dy <= 2; dy++) {
            const x = Math.round(botPos.x + dx);
            const y = Math.round(botPos.y + dy);
            const z = Math.round(botPos.z + dz);
            const block = this.voxelWorld.getBlock(x, y, z);
            if (block && this.isResourceBlock(block.type)) {
              // Check if surface is reachable
              const surfaceY = this.findSurfaceHeight(x, z);
              if (surfaceY !== null) {
                return new THREE.Vector3(x + 0.5, surfaceY, z + 0.5);
              }
            }
          }
        }
      }
      return null;
    }

  // BFS on block grid to find a path from start to goal on surface
  private findSurfacePath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] {
    // Snap start position to nearest grid position
    const startGridX = Math.floor(start.x) + 0.5;
    const startGridZ = Math.floor(start.z) + 0.5;
    const startSurfaceY = this.findSurfaceHeight(startGridX, startGridZ);
    
    if (startSurfaceY === null) {
      this.logNavigation('no-start-surface', 1000, { x: startGridX, z: startGridZ });
      return [];
    }
    
    const startPos = new THREE.Vector3(startGridX, startSurfaceY, startGridZ);
    
    const queue: PathNode[] = [{ pos: startPos, parent: null }];
    const visited = new Set<string>();
    const key = (v: THREE.Vector3) => `${Math.floor(v.x)},${Math.floor(v.z)}`;
    visited.add(key(startPos));
    let found: PathNode | null = null;
    let iterations = 0;
    const maxIterations = 1000;
    const goalGridX = Math.floor(goal.x) + 0.5;
    const goalGridZ = Math.floor(goal.z) + 0.5;
    
    while (queue.length && iterations < maxIterations) {
      iterations++;
      const node = queue.shift()!;

      if (Math.abs(node.pos.x - goalGridX) < 0.01 && Math.abs(node.pos.z - goalGridZ) < 0.01) {
        found = node;
        break;
      }
      
      // 4-way surface neighbors (X/Z) using grid coordinates
      const nodeGridX = Math.floor(node.pos.x) + 0.5;
      const nodeGridZ = Math.floor(node.pos.z) + 0.5;
      
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = nodeGridX + dx;
        const nz = nodeGridZ + dz;
        // Use current node Y as preference for search range to keep bot on same layer if possible
        const surfaceHeight = this.findSurfaceHeight(nx, nz, node.pos.y);
        
        if (surfaceHeight === null) {
          continue;
        }
        
        // Check if movement between layers is too steep
        if (Math.abs(surfaceHeight - node.pos.y) > 1.5) {
          continue;
        }

        // Check if there is space for the bot's body at the destination surface height
        // We check at the center of the bot (surfaceHeight) and slightly above
        if (this.isCollidingAt(nx, surfaceHeight, nz) || this.isCollidingAt(nx, surfaceHeight + 0.5, nz)) {
          continue;
        }
        
        const npos = new THREE.Vector3(nx, surfaceHeight, nz);
        const k = key(npos);
        
        if (!visited.has(k)) {
          visited.add(k);
          queue.push({ pos: npos, parent: node });
        }
      }
    }
    
    if (!found) {
      this.logNavigation('path-search-failed', 1000, {
        iterations,
        visited: visited.size,
        goal: goal.toArray()
      });
    }
    
    // Reconstruct path
    const path: THREE.Vector3[] = [];
    while (found) {
      path.push(found.pos);
      found = found.parent;
    }

    const reconstructed = path.reverse();
    if (reconstructed.length > 0) {
      const finalNode = reconstructed[reconstructed.length - 1];
      const preciseGoal = new THREE.Vector3(goal.x, finalNode.y, goal.z);
      if (finalNode.distanceTo(preciseGoal) > 0.02) {
        reconstructed.push(preciseGoal);
      }
    }

    return reconstructed;
  }

  private isResourceBlock(type: BlockType): boolean {
    return type === BlockType.IRON_ORE || type === BlockType.GOLD_ORE || type === BlockType.DIAMOND_ORE;
  }

  private moveToPosition(targetPos: THREE.Vector3, deltaTime: number): void {
    const currentPos = this.bot.state.position.clone();
    
    // Calculate direction to target in 3D space
    const diff = targetPos.clone().sub(currentPos);
    const distance = diff.length();
    
    // Allow movement even at very close distances - let the waypoint threshold handle stopping
    if (distance < 0.001) {
       this.velocity.set(0, 0, 0);
       return;
    }
    
    const direction = diff.normalize();
    const speed = this.config.navigation.speed;
    const moveDist = Math.min(speed * deltaTime, distance);
    const movement = direction.clone().multiplyScalar(moveDist);
    
    // Collision check before moving horizontally
    const nextPos = currentPos.clone().add(movement);
    if (this.isCollidingAt(nextPos.x, nextPos.y, nextPos.z) || this.isCollidingAt(nextPos.x, nextPos.y + 0.5, nextPos.z)) {
      // If blocked, try to slide along X or Z if possible
      const moveX = new THREE.Vector3(movement.x, 0, 0);
      const nextPosX = currentPos.clone().add(moveX);
      if (!this.isCollidingAt(nextPosX.x, nextPosX.y, nextPosX.z) && !this.isCollidingAt(nextPosX.x, nextPosX.y + 0.5, nextPosX.z)) {
        movement.set(moveX.x, 0, 0);
      } else {
        const moveZ = new THREE.Vector3(0, 0, movement.z);
        const nextPosZ = currentPos.clone().add(moveZ);
        if (!this.isCollidingAt(nextPosZ.x, nextPosZ.y, nextPosZ.z) && !this.isCollidingAt(nextPosZ.x, nextPosZ.y + 0.5, nextPosZ.z)) {
          movement.set(0, 0, moveZ.z);
        } else {
          // Fully blocked
          movement.set(0, 0, 0);
        }
      }
    }

    // Apply movement
    this.bot.state.position.add(movement);
    
    // Update Y position to hug surface if we moved
    if (movement.x !== 0 || movement.z !== 0) {
      const surfaceY = this.findSurfaceHeight(this.bot.state.position.x, this.bot.state.position.z, this.bot.state.position.y);
      if (surfaceY !== null && Math.abs(surfaceY - this.bot.state.position.y) < 1.1) {
        this.bot.state.position.y = surfaceY;
      }
    }
    
    this.velocity.copy(movement).divideScalar(deltaTime);
  }

  private findSurfaceHeight(x: number, z: number, preferredY?: number): number | null {
    // Snap x and z to grid centers (e.g., -1.5, -0.5, 0.5, 1.5)
    // In our GRID system, blocks are centered at half-unit offsets
    const gridX = Math.floor(x) + 0.5;
    const gridZ = Math.floor(z) + 0.5;
    
    // Use preferredY or current position to focus search range
    const searchCenterY = preferredY !== undefined ? preferredY : this.bot.state.position.y;
    
    // Scan downward to find surface, starting slightly above search center
    const startY = Math.min(10, Math.floor(searchCenterY + 1.5));
    const endY = -40; // World usually starts at 0 and goes down to -20
    
    for (let y = startY; y >= endY; y--) {
      const block = this.voxelWorld.getBlock(gridX, y, gridZ);
      
      if (block && block.type > BlockType.AIR) {
        // Found solid block, return surface height above it
        // Blocks are centered at integer y, so top surface is y + 0.5
        const surfaceY = y + 0.5 + this.config.navigation.sphereRadius + 0.05;
        return surfaceY;
      }
    }
    
    // No surface found
    return null;
  }

  private isCollidingAt(x: number, y: number, z: number): boolean {
    // Check if the body (modeled as a point or small radius) is inside a solid block
    // We check the block at the bot's center height
    const block = this.voxelWorld.getBlock(x, y, z);
    return !!(block && block.type > BlockType.AIR);
  }

  public findNearestSurface(): THREE.Vector3 | null {
    const currentPosition = this.bot.state.position.clone();
    const searchRadius = this.config.navigation.raycastDistance;
    
    // Search for nearest solid block
    for (let radius = 0; radius <= searchRadius; radius++) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const x = currentPosition.x + Math.cos(angle) * radius;
        const z = currentPosition.z + Math.sin(angle) * radius;
        
        const surfaceHeight = this.findSurfaceHeight(x, z);
        
        if (surfaceHeight !== null) {
          return new THREE.Vector3(x, surfaceHeight, z);
        }
      }
    }
    
    return null;
  }

  public canMoveTo(position: THREE.Vector3): boolean {
    const surfaceHeight = this.findSurfaceHeight(position.x, position.z);
    
    if (surfaceHeight === null) {
      return false;
    }
    
    // Check if the height difference is climbable
    const heightDiff = Math.abs(position.y - surfaceHeight);
    return heightDiff < 1.5;
  }

  public getVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }

  public isMoving(): boolean {
    return this.velocity.length() > 0.001;
  }

  public resetStuckDetection(): void {
    this.stuckDetectionTimer = 0;
    this.bot.isStuck = false;
  }

  public setBeingDragged(isDragged: boolean): void {
    this.bot.isBeingDragged = isDragged;
    if (isDragged) {
      this.resetStuckDetection();
    }
  }

  public setPosition(position: THREE.Vector3): void {
    this.bot.state.position.copy(position);
    this.previousPosition.copy(position);
    this.resetStuckDetection();
    this.supportConfirmationFrames = 0;
    this.stateTransitionDebounce = 0.3;
    this.lastGroundedY = position.y;
    this.landedFrame = 0;
  }

  public getSurfaceNormal(): THREE.Vector3 {
    const currentPosition = this.bot.state.position;
    const surfaceHeight = this.findSurfaceHeight(currentPosition.x, currentPosition.z);
    
    if (surfaceHeight === null) {
      return new THREE.Vector3(0, 1, 0);
    }
    
    // Calculate normal using finite differences
    const offset = 0.01;
    const yRight = this.findSurfaceHeight(currentPosition.x + offset, currentPosition.z);
    const yUp = this.findSurfaceHeight(currentPosition.x, currentPosition.z + offset);
    
    if (yRight === null || yUp === null) {
      return new THREE.Vector3(0, 1, 0);
    }
    
    const right = new THREE.Vector3(offset, yRight - surfaceHeight, 0);
    const up = new THREE.Vector3(0, yUp - surfaceHeight, offset);
    
    const normal = new THREE.Vector3().crossVectors(right, up).normalize();
    return normal;
  }
}