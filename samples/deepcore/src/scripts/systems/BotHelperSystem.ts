import * as THREE from 'three';
import { ISystem } from '../core/ISystem';
import { BotEntity, BotConfig, BotState, BotStateType, BlockType, GRID } from '../core/Types';
import { VoxelWorld } from '../world';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ToolSystem } from './ToolSystem';
import { BotStateMachine } from './BotStateMachine';
import { BotNavigation } from '../utils/BotNavigation';
import { BotRenderer } from '../rendering/BotRenderer';
import { botConfig } from '../config/bot';
import { DroppableItemsSystem } from './DroppableItemsSystem';

export class BotHelperSystem implements ISystem {
  private voxelWorld: VoxelWorld;
  private physicsWorld: PhysicsWorld; // Stored for future use
  private toolSystem: ToolSystem; // Stored for future use
  private scene: THREE.Scene;
  private config: BotConfig;
  
  private bot!: BotEntity;
  private stateMachine!: BotStateMachine;
  private navigation!: BotNavigation;
  private renderer!: BotRenderer;
  private resourceDropSystem: DroppableItemsSystem | null = null;
  
  private isActive: boolean;
  private initializationTimer: number;
  
  constructor(
    voxelWorld: VoxelWorld,
    physicsWorld: PhysicsWorld,
    toolSystem: ToolSystem,
    scene: THREE.Scene
  ) {
    this.voxelWorld = voxelWorld;
    this.physicsWorld = physicsWorld;
    this.toolSystem = toolSystem;
    this.scene = scene;
    this.config = botConfig;
    this.isActive = false;
    this.initializationTimer = 0;
    
    this.createBot();
    console.log('[BotHelperSystem] Bot helper system initialized');
    
    // Note: physicsWorld and toolSystem stored for future use
    physicsWorld;
    toolSystem;
  }
  
  private createBot(): void {
    // Create bot entity
    this.bot = this.createBotEntity();
    
    // Create state machine
    this.stateMachine = new BotStateMachine(this.bot, this.config);
    
    // Create navigation system
    this.navigation = new BotNavigation(this.bot, this.voxelWorld, this.config);
    
    // Create renderer
    this.renderer = new BotRenderer(this.bot, this.scene, this.config);
    
    // Hide visual until started
    this.renderer.setVisible(false);
    
    console.log('[BotHelperSystem] Bot entity created at position:', this.bot.state.position);
  }
  
  private createBotEntity(): BotEntity {
    // Use a neutral default position and resolve safe placement on start().
    // This avoids running spawn checks before the bot is purchased/activated.
    const startPosition = new THREE.Vector3(0, 5, 0);
    
    // Create initial state
    const state: BotState = {
      position: startPosition,
      target: undefined,
      itemTarget: undefined,
      surfaceNormal: new THREE.Vector3(0, 1, 0),
      state: BotStateType.IDLE,
      stuckTimer: 0,
      recoveryTimer: 0,
      fallingTimer: 0,
      isLanding: false,
      errorCount: 0,
      lastHarvestTime: 0,
      lastSearchTime: 0
    };
    
    // Create bot entity
    const bot: BotEntity = {
      id: `bot-${Date.now()}`,
      state: state,
      collider: new THREE.Group(),
      visual: new THREE.Group(),
      physicsBody: undefined,
      isStuck: false,
      isFalling: false,
      isBeingDragged: false
    };
    
    return bot;
  }
  
  private findSafeStartPosition(): THREE.Vector3 | null {
    // Try to find any solid block surface in the grid
    // Scanning from top to bottom, checking all columns within the grid boundaries
    for (let y = 10; y >= -30; y--) {
      for (let x = GRID.minX; x <= GRID.maxX; x++) {
        for (let z = GRID.minZ; z <= GRID.maxZ; z++) {
          const block = this.voxelWorld.getBlock(x, y, z);
          
          if (block && block.type > BlockType.BEDROCK) {
            // Found a solid block, place bot above it
            // Block is 1x1x1 centered at y, so top surface is y + 0.5
            return new THREE.Vector3(x, y + 0.5 + this.config.navigation.sphereRadius + 0.05, z);
          }
        }
      }
    }
    
    return null;
  }
  
  public setResourceDropSystem(system: DroppableItemsSystem): void {
    this.resourceDropSystem = system;
    this.stateMachine.setDroppableItemsSystem(system);
  }
  
  public start(): void {
    if (this.isActive) {
      console.log('[BotHelperSystem] Bot is already active');
      return;
    }
    
    // Try to find a better starting position now that the world is likely generated
    const safePos = this.findSafeStartPosition();
    if (safePos) {
      this.bot.state.position.copy(safePos);
      this.navigation.setPosition(safePos);
      console.log('[BotHelperSystem] Bot repositioned to safe start:', safePos);
    }
    
    // Show bot visual
    this.renderer.setVisible(true);
    
    this.isActive = true;
    this.initializationTimer = 0;
    console.log('[BotHelperSystem] Bot activated and started');
  }
  
  public stop(): void {
    if (!this.isActive) {
      console.log('[BotHelperSystem] Bot is already inactive');
      return;
    }
    
    this.isActive = false;
    this.renderer.setVisible(false);
    console.log('[BotHelperSystem] Bot deactivated');
  }
  
  public toggle(): void {
    if (this.isActive) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  update(deltaTime: number): void {
    if (!this.isActive) {
      return;
    }
    
    // Suppress unused parameter warnings
    this.physicsWorld;
    this.toolSystem;
    
    // Update initialization timer
    this.initializationTimer += deltaTime;
    
    // Wait a moment before starting to ensure world is ready
    if (this.initializationTimer < 1.0) {
      return;
    }
    
    // Update state machine
    this.stateMachine.update(deltaTime);
    
    // Update navigation
    this.navigation.update(deltaTime);
    
    // Check for resource collection
    if (this.resourceDropSystem) {
      this.resourceDropSystem.checkProximityCollection(this.bot.state.position, this.config.collection.collectionRange);
    }
    
    // Update renderer
    this.renderer.update(deltaTime);
    
    // Update bot collider position
    this.bot.collider.position.copy(this.bot.state.position);
  }
  
  dispose(): void {
    console.log('[BotHelperSystem] Disposing bot helper system');
    
    this.stop();
    this.renderer.dispose();
    
    if (this.bot.visual && this.scene) {
      this.scene.remove(this.bot.visual);
    }
    
    if (this.bot.collider && this.scene) {
      this.scene.remove(this.bot.collider);
    }
  }
  
  public getBot(): BotEntity {
    return this.bot;
  }
  
  public getState(): BotStateType {
    return this.stateMachine.getState();
  }
  
  public getErrorCount(): number {
    return this.stateMachine.getErrorCount();
  }
  
  public resetErrorCount(): void {
    this.stateMachine.resetErrorCount();
  }
  
  public resetStuck(): void {
    this.navigation.resetStuckDetection();
    console.log('[BotHelperSystem] Bot stuck state reset');
  }
  
  public teleport(position: THREE.Vector3): void {
    this.bot.state.position.copy(position);
    this.navigation.setPosition(position);
    console.log('[BotHelperSystem] Bot teleported to:', position);
  }
  
  public setDebugMode(enabled: boolean): void {
    this.config.debug.showCollider = enabled;
    this.renderer.setDebugMode(enabled);
    console.log(`[BotHelperSystem] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  public getVisualMesh(): THREE.Object3D | null {
    return this.renderer.getVisualMesh();
  }
  
  public getColliderMesh(): THREE.Mesh | null {
    return this.renderer.getColliderMesh();
  }
  
  public getTargetHighlight(): THREE.Mesh | null {
    return this.renderer.getTargetHighlight();
  }
  
  public applyFloatingOriginOffset(offset: THREE.Vector3): void {
    // Apply offset to bot position
    this.bot.state.position.sub(offset);
    this.bot.collider.position.sub(offset);
    
    if (this.bot.visual) {
      this.bot.visual.position.sub(offset);
    }
    
    console.log('[BotHelperSystem] Applied floating origin offset:', offset);
  }
  
  public handleBotDragStart(): void {
    this.navigation.setBeingDragged(true);
    console.log('[BotHelperSystem] Bot drag started');
  }
  
  public handleBotDragUpdate(position: THREE.Vector3): void {
    this.navigation.setPosition(position);
    console.log('[BotHelperSystem] Bot drag update:', position);
  }
  
  public handleBotDragEnd(position: THREE.Vector3): void {
    this.navigation.setPosition(position);
    this.navigation.setBeingDragged(false);
    
    // Check if bot needs to recover
    const currentState = this.stateMachine.getState();
    if (currentState === BotStateType.ERROR) {
      // Transition to recovering state
      console.log('[BotHelperSystem] Bot rescued! Transitioning to recovering state...');
      this.bot.state.recoveryTimer = 0;
      this.bot.state.state = BotStateType.RECOVERING;
    }
    
    console.log('[BotHelperSystem] Bot drag ended at:', position);
  }
}