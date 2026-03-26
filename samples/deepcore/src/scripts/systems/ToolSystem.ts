import {
  BlockType,
  BLOCK_PROPERTIES,
  ToolType,
  TOOL_PROPERTIES,
  STABILITY_CONFIG,
  UNSTABLE_BLOCKS,
  GameEvents,
  emitGameEvent,
} from '../core/Types';
import { useGameStore, getTotalDamageMultiplier } from '../core/GameStore';
import { VoxelWorld, type VoxelData } from '../world';
import { HapticSystem } from './HapticSystem';
import { GAMEPLAY_CONFIG } from '../config';
import { calculateMiningStats } from '../utils/MiningCalculator';
import * as THREE from 'three';

export class ToolSystem {
  private voxelWorld: VoxelWorld;
  private drillInterval: number | null = null;
  private currentDrillTarget: { x: number; y: number; z: number; hitPoint?: THREE.Vector3 } | null = null;
  private cameraController: any = null; // Will be set by Game.ts
  
  constructor(voxelWorld: VoxelWorld) {
    this.voxelWorld = voxelWorld;
  }

  // Called by Game.ts to set camera controller for screen shake
  setCameraController(camera: any): void {
    this.cameraController = camera;
  }
  
  // Calculate damage for a tool against a block type
  calculateDamage(toolType: ToolType, blockType: BlockType, y?: number): number {
    const tool = TOOL_PROPERTIES[toolType];
    const block = BLOCK_PROPERTIES[blockType];
    
    let damage = tool.baseDamage;
    
    // Apply tool multipliers based on block type
    if (blockType === BlockType.STONE || 
        blockType === BlockType.IRON_ORE || 
        blockType === BlockType.GOLD_ORE ||
        blockType === BlockType.DIAMOND_ORE) {
      damage *= tool.stoneMultiplier;
    } else if (blockType === BlockType.DIRT) {
      damage *= tool.dirtMultiplier;
    }
    
    // Apply hardness resistance
    damage /= block.hardness || 1;
    
    // Apply player damage multiplier (upgrades + turbo)
    damage *= getTotalDamageMultiplier();
    
    // Apply Average Surface Depth (ASD) penalty if Y is provided
    if (y !== undefined && GAMEPLAY_CONFIG.mining) {
      const asd = this.voxelWorld.getAverageSurfaceDepth();
      const stats = calculateMiningStats(-y, asd, GAMEPLAY_CONFIG.mining);
      
      // Apply miss chance
      if (Math.random() < stats.missChance) {
        return 0; // Miss!
      }

      damage *= stats.damageMultiplier;
    }

    return Math.max(1, Math.ceil(damage));
  }
  
  // Use tap-based tool (Pickaxe, Shovel)
  useTapTool(x: number, y: number, z: number, hitPoint?: THREE.Vector3): boolean {
    const state = useGameStore.getState();
    const tool = TOOL_PROPERTIES[state.currentTool];
    
    if (tool.inputMode !== 'tap') {
      return false;
    }
    
    // DISABLED: Fuel consumption for testing
    // if (!state.consumeFuel(tool.fuelCost)) {
    //   return false;
    // }
    
    // Consume turbo fuel if active
    if (state.turboActive) {
      state.consumeTurboFuel(tool.fuelCost * 0.5);
    }
    
    return this.damageBlockAt(x, y, z, state.currentTool, hitPoint);
  }
  
  // Start drill on a block
  startDrill(x: number, y: number, z: number, hitPoint?: THREE.Vector3): void {
    const state = useGameStore.getState();
    
    if (state.currentTool !== ToolType.DRILL) {
      return;
    }
    
    this.stopDrill();
    
    const tool = TOOL_PROPERTIES[ToolType.DRILL];
    this.currentDrillTarget = { x, y, z, hitPoint };
    
    const drillStep = () => {
      if (!this.currentDrillTarget) return;

      const state = useGameStore.getState();
      
      // Consume turbo fuel if active
      if (state.turboActive) {
        state.consumeTurboFuel(tool.fuelCost * 0.5);
      }
      
      const destroyed = this.damageBlockAt(
        this.currentDrillTarget.x,
        this.currentDrillTarget.y,
        this.currentDrillTarget.z,
        ToolType.DRILL,
        this.currentDrillTarget.hitPoint
      );
      
      if (destroyed) {
        this.stopDrill();
      } else {
        // Schedule next step with dynamic tick rate based on depth
        let tickRate = tool.tickRate || 100;
        if (GAMEPLAY_CONFIG.mining) {
          const asd = this.voxelWorld.getAverageSurfaceDepth();
          const stats = calculateMiningStats(-this.currentDrillTarget.y, asd, GAMEPLAY_CONFIG.mining);
          tickRate = Math.round(tickRate / stats.speedMultiplier);
        }
        
        this.drillInterval = window.setTimeout(drillStep, tickRate) as any;
      }
    };
    
    // Start the first step
    drillStep();
  }
  
  // Stop drilling
  stopDrill(): void {
    if (this.drillInterval !== null) {
      clearTimeout(this.drillInterval);
      this.drillInterval = null;
    }
    this.currentDrillTarget = null;
  }
  
  // Update drill target position
  updateDrillTarget(x: number, y: number, z: number, hitPoint?: THREE.Vector3): void {
    if (this.drillInterval !== null) {
      this.currentDrillTarget = { x, y, z, hitPoint };
    }
  }
  
  // Apply damage to a block
  public damageBlockAt(x: number, y: number, z: number, toolType: ToolType, hitPoint?: THREE.Vector3): boolean {
    const block = this.voxelWorld.getBlock(x, y, z);
    
    if (!block || block.type === BlockType.BEDROCK || block.type === BlockType.AIR) {
      return false;
    }

    // Surface-only rule: prevent mining blocks with no exposed faces.
    if (!this.voxelWorld.isBlockInteractable(x, y, z)) {
      return false;
    }
    
    const tool = TOOL_PROPERTIES[toolType];
    const impactType = tool.impactType || 'damage';
    const impactRadius = tool.impactRadius || 1.2;

    // Trigger screen shake with tool-specific or default config
    if (this.cameraController) {
      const shakeConfig = tool.screenShake || GAMEPLAY_CONFIG.screenShake;
      this.cameraController.shake(shakeConfig.amplitude, shakeConfig.duration);
    }

    if (block.type === BlockType.UNSTABLE) {
      const progress = this.voxelWorld.registerUnstableToolHit(x, y, z, hitPoint);
      const damage = this.calculateDamage(toolType, block.type, y);

      HapticSystem.toolHit();
      this.applyToolVibration(x, y, z, damage, impactType, impactRadius);

      if (!progress) {
        return false;
      }

      if (progress.hitCount >= UNSTABLE_BLOCKS.hitsToExplode) {
        const destroyDamage = Math.max(1, Math.ceil(block.hp));
        return this.voxelWorld.damageBlock(x, y, z, destroyDamage, hitPoint, 'tool').destroyed;
      }

      const safeDamage = Math.min(damage, Math.max(0, block.hp - 1));
      if (safeDamage > 0) {
        this.voxelWorld.damageBlock(x, y, z, safeDamage, hitPoint, 'tool');
      }

      return false;
    }

    const damage = this.calculateDamage(toolType, block.type, y);
    const result = this.voxelWorld.damageBlock(x, y, z, damage, hitPoint, 'tool');
    
    // Trigger haptic feedback on tool hit
    HapticSystem.toolHit();
    
    // Apply vibration/stability to neighbors
    this.applyToolVibration(x, y, z, damage, impactType, impactRadius);
    
    if (result.destroyed) {
      return true;
    } else {
      return false;
    }
  }

  // Implementation of tool vibration BFS
  private applyToolVibration(
    x: number, 
    y: number, 
    z: number, 
    initialDamage: number, 
    impactType: 'none' | 'damage' | 'stability',
    radius: number
  ): void {
    const queue: { x: number, y: number, z: number, dist: number }[] = [];
    queue.push({ x, y, z, dist: 0 });
    
    const visited = new Set<string>();
    visited.add(`${x},${y},${z}`);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.dist >= radius) continue;
      
      const neighbors = [
        { dx: 1, dy: 0, dz: 0 }, { dx: -1, dy: 0, dz: 0 },
        { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: -1, dz: 0 },
        { dx: 0, dy: 0, dz: 1 }, { dx: 0, dy: 0, dz: -1 }
      ];
      
      for (const n of neighbors) {
        const nx = current.x + n.dx;
        const ny = current.y + n.dy;
        const nz = current.z + n.dz;
        const key = `${nx},${ny},${nz}`;
        
        if (visited.has(key)) continue;
        visited.add(key);
        
        const block = this.voxelWorld.getBlock(nx, ny, nz);
        if (!block || block.type === BlockType.AIR || block.type === BlockType.BEDROCK || block.isDying) continue;
        
        const dist = Math.sqrt((nx - x)**2 + (ny - y)**2 + (nz - z)**2);
        if (dist > radius) continue;
        
        const props = BLOCK_PROPERTIES[block.type];
        
        if (impactType === 'damage') {
          // Formula: NeighborDamage = (InitialEnergy * 0.5) / (Distance^2) * (1 - Absorption)
          // Drastically reduced damage spread
          const attenuatedDamage = initialDamage * 0.4; // Only 40% of original damage transfers out
          const vibrationDamage = Math.floor((attenuatedDamage / (dist * dist)) * (1 - props.energyAbsorption));
          
          if (vibrationDamage > 0) {
            const result = this.voxelWorld.damageBlock(nx, ny, nz, vibrationDamage, undefined, 'system');
            
            // Visual wobble
            block.wobble = Math.min(1.0, block.wobble + vibrationDamage * STABILITY_CONFIG.wobblePerDamage);
            
            if (!result.destroyed && result.remaining < props.hp * 0.5) {
              // Trigger Stability Check if neighbor's HP drops significantly
              emitGameEvent(GameEvents.STABILITY_CHECK, { x: nx, y: ny, z: nz });
            }
          }
        } else if (impactType === 'stability') {
           // Stability damage logic
           // More intense wobble
           // Reduces integrity but does NOT deal HP damage
           
           // Force attenuates with distance
           const stabilityForce = initialDamage * 2.0; 
           const loss = Math.floor(stabilityForce / (dist * dist || 1));
           
           if (loss > 0) {
             // Reduce integrity
             block.integrity = Math.max(0, block.integrity - loss);
             
             // Increase wobble (more than normal damage)
             block.wobble = Math.min(1.0, block.wobble + loss * 0.05);

             if (block.integrity <= 0) {
                // Check if this causes instability
                emitGameEvent(GameEvents.STABILITY_CHECK, { x: nx, y: ny, z: nz });
             }
           }
        }
        
        queue.push({ x: nx, y: ny, z: nz, dist });
      }
    }
  }
  
  // Apply impact damage from falling block
  applyImpactDamage(
    fallingBlock: VoxelData,
    targetX: number,
    targetY: number,
    targetZ: number,
    velocity: number
  ): boolean {
    const targetBlock = this.voxelWorld.getBlock(targetX, targetY, targetZ);
    
    if (!targetBlock || targetBlock.type === BlockType.BEDROCK) {
      return false;
    }
    
    // Calculate impact damage: velocity * density
    const density = BLOCK_PROPERTIES[fallingBlock.type].density;
    const damage = Math.floor(velocity * density * 10);
    
    if (damage < 5) return false;
    
    const result = this.voxelWorld.damageBlock(targetX, targetY, targetZ, damage, undefined, 'fallImpact');
    
    if (result.destroyed) {
      return true;
    }

    // Apply vibration for surviving blocks on impact
    this.applyToolVibration(targetX, targetY, targetZ, damage, 'damage', 1.2);

    return false;
  }

  // Public method for block damage handling (called by Game)
  onBlockDamage(block: VoxelData, damage: number): void {
    // Vibration is now initiated by the damage source (ToolSystem or Physics impact)
    // to allow different impact types (stability vs damage) and prevent double-dipping.
    
    // Always apply some wobble to the block itself if it survives
    if (!block.isDying) {
      block.wobble = Math.min(1.0, block.wobble + damage * STABILITY_CONFIG.wobblePerDamage);
    }
  }

  // Visual shockwave when a block is destroyed
  public propagateShockwaveFromDestruction(x: number, y: number, z: number): void {
    // For destruction, we can use a smaller radius and only affect wobble
    const radius = 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          const block = this.voxelWorld.getBlock(nx, ny, nz);
          if (block && !block.isDying) {
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist <= radius) {
              block.wobble = Math.max(0.2, block.wobble);
            }
          }
        }
      }
    }
  }

  // Dispose
  dispose(): void {
    this.stopDrill();
  }
}
