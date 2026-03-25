import * as THREE from 'three';
import { Renderer, RendererOptions } from '../rendering/Renderer';
import { InputManager } from '../input/InputManager';
import { VoxelWorld, VoxelData } from '../world';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { StabilitySystem } from '../physics/StabilitySystem';
import { ToolSystem } from '../systems/ToolSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { ImpactSparkSystem } from '../systems/ImpactSparkSystem';
// LootSystem removed; unified DroppableItemsSystem will be created in init()
import { FeedbackSystem } from '../systems/FeedbackSystem';
// ResourceDropSystem replaced by DroppableItemsSystem
// import { ResourceDropSystem } from '../systems/ResourceDropSystem';
import { ClusterSystem } from '../systems/ClusterSystem';
import { InventoryUISystem } from '../systems/InventoryUISystem';
import { AvatarUISystem } from '../systems/AvatarUISystem';
import { WallPlaneSystem } from '../systems/WallPlaneSystem';
import { DepthMarkerSystem } from '../systems/DepthMarkerSystem';
import { BotHelperSystem } from '../systems/BotHelperSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { UIManager } from '../ui/UIManager';
import { DebugController } from '../ui/DebugController';
import {
  BLOCK_PROPERTIES,
  BlockType,
  ToolType,
  TOOL_PROPERTIES,
  GRID,
  UNSTABLE_BLOCKS,
  GameEvents,
  onGameEvent,
  // ResourceSettledEvent,
  BlockDestroyedEvent,
  BlockDamagedEvent,
  BlockFallingEvent,
  BlockPlacedEvent,
  BotStateChangedEvent,
  LootCollectedEvent,
  ResourcesDroppedEvent,
} from '../core/Types';

import { atlasManager } from '../utils/AtlasManager';
import { ATLAS_CONFIG } from '../assets/textures';
import { useGameStore } from '../core/GameStore';
import { gameplayConfig } from '../config/gameplay';

// Per-pointer interaction tracking
interface PointerInteraction {
  id: number;
  screenX: number;
  screenY: number;
  hoveredBlock: VoxelData | null;
  isHolding: boolean;
  drillTarget: { x: number; y: number; z: number } | null;
  initialScreenX: number;  // Position when pointer down
  initialScreenY: number;
  initialBlock: VoxelData | null;  // Block when pointer down
}

interface ToolHpBarTarget {
  x: number;
  y: number;
  z: number;
  displayPosition: THREE.Vector3;
  persistent: boolean;
}

interface QueuedExplosion {
  x: number;
  y: number;
  z: number;
  triggerTime: number;
}

export interface GameOptions {
  /** Pass renderer options to enable embedded mode (external scene from pix3). */
  renderer?: RendererOptions;
}

export class Game {
  private renderer: Renderer;
  private inputManager: InputManager | null = null;
  private voxelWorld: VoxelWorld;
  private physicsWorld: PhysicsWorld;
  private stabilitySystem: StabilitySystem;
  private toolSystem: ToolSystem;
  private particleSystem: ParticleSystem;
  private impactSparkSystem: ImpactSparkSystem;
  // lootSystem removed; unified droppable items live in resourceDropSystem
  private feedbackSystem: FeedbackSystem;
  private resourceDropSystem: any;
  private clusterSystem: ClusterSystem;
  private inventoryUISystem: InventoryUISystem;
  private avatarUISystem: AvatarUISystem;
  private wallPlaneSystem: WallPlaneSystem;
  private depthMarkerSystem: DepthMarkerSystem;
  private botHelperSystem: BotHelperSystem;
  private audioSystem: AudioSystem;
  private uiManager: UIManager;
  private debugController: DebugController;
  private cameraDebugFrame: THREE.LineSegments | null = null;

  // Multi-pointer interaction tracking
  private pointerInteractions: Map<number, PointerInteraction> = new Map();

  // Legacy hover tracking (for single-pointer hover display)
  private hoveredBlock: VoxelData | null = null;

  // Pointer tracking for resource settle highlight check
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private readonly pointerRaycaster: THREE.Raycaster = new THREE.Raycaster();
  private readonly pointerNdc: THREE.Vector2 = new THREE.Vector2();
  private readonly pointerRay: THREE.Ray = new THREE.Ray();
  private currentToolHpBarTarget: ToolHpBarTarget | null = null;
  private readonly queuedExplosions: QueuedExplosion[] = [];
  private readonly queuedExplosionKeys: Set<string> = new Set();
  private lastQueuedExplosionTime: number = 0;
  private isResolvingExplosion: boolean = false;
  private hasPendingPostExplosionStability: boolean = false;

  // State
  private isInitialized: boolean = false;
  private currentDepth: number = 0;
  private frameCount: number = 0;
  private isPaused: boolean = false;

  constructor(options?: GameOptions) {
    // Initialize renderer (embedded or standalone)
    this.renderer = new Renderer(options?.renderer);
    this.physicsWorld = new PhysicsWorld();
    this.voxelWorld = new VoxelWorld();
    this.stabilitySystem = new StabilitySystem(this.voxelWorld);
    this.toolSystem = new ToolSystem(this.voxelWorld);
    this.toolSystem.setCameraController(this.renderer.cameraController);
    this.particleSystem = new ParticleSystem(this.renderer.scene);
    this.impactSparkSystem = new ImpactSparkSystem(
      this.renderer.scene,
      this.renderer.cameraController.camera
    );
    this.feedbackSystem = new FeedbackSystem(
      this.renderer.scene,
      this.renderer.cameraController.camera
    );
    this.resourceDropSystem = null;
    this.clusterSystem = new ClusterSystem(this.renderer.scene, this.voxelWorld);
    
    // UI systems will be initialized in init() after texture atlas is loaded
    this.inventoryUISystem = null as any;
    this.avatarUISystem = null as any;

    this.wallPlaneSystem = new WallPlaneSystem(this.renderer.scene);
    this.depthMarkerSystem = new DepthMarkerSystem(this.renderer.scene);
    this.botHelperSystem = new BotHelperSystem(
      this.voxelWorld,
      this.physicsWorld,
      this.toolSystem,
      this.renderer.scene
    );
    this.audioSystem = new AudioSystem(useGameStore.getState().soundEnabled);
    this.uiManager = new UIManager();
    this.debugController = new DebugController(
      () => this.renderer.getLightParams(),
      (params) => {
        this.renderer.setLightParams(params);
      },
      () => this.toggleDebugVisuals(),
      (v: boolean) => {
        if (this.particleSystem) this.particleSystem.setVisible(v);
        if (this.impactSparkSystem) this.impactSparkSystem.setVisible(v);
      },
      (v: boolean) => { 
        if(this.feedbackSystem) this.feedbackSystem.setVisible(v);
        if(this.inventoryUISystem) this.inventoryUISystem.setVisible(v);
        if(this.avatarUISystem) this.avatarUISystem.setVisible(v);
      },
      () => this.renderer.cameraController.getZoomFactor(),
      (v: number) => this.renderer.cameraController.setZoomFactor(v),
      (enabled: boolean) => this.renderer.setShadowsEnabled(enabled)
    );

    // Set up input — in embedded mode, skip canvas-based InputManager
    if (!this.renderer.embedded) {
      const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
      this.inputManager = new InputManager(canvas, {
        onPointerDown: this.handlePointerDown.bind(this),
        onPointerMove: this.handlePointerMove.bind(this),
        onPointerUp: this.handlePointerUp.bind(this),
        onHoldStart: this.handleHoldStart.bind(this),
        onHoldEnd: this.handleHoldEnd.bind(this),
        onRotateStep: this.handleRotateStep.bind(this),
        onVerticalScroll: this.handleVerticalScroll.bind(this),
      });
    }

    // Listen for scene change events to update hover state
    // ResourceSettled event deprecated - ignore

    onGameEvent<BlockDamagedEvent>(GameEvents.BLOCK_DAMAGED, (data) => {
      this.handleBlockDamaged(data);
      this.audioSystem.handleBlockDamaged(data);
    });

    onGameEvent<BlockDestroyedEvent>(GameEvents.BLOCK_DESTROYED, (data) => {
      this.audioSystem.handleBlockDestroyed(data);
      this.refreshAllHoverStates();

      // Remove physics body if it exists
      const physicsBody = this.physicsWorld.findBlockAt(data.x, data.y, data.z);
      if (physicsBody) {
        this.physicsWorld.removeBody(physicsBody);
      }
      // Wake up droppables in the same column above this block
      if (this.resourceDropSystem && this.resourceDropSystem.wakeDroppablesInColumn) {
        this.resourceDropSystem.wakeDroppablesInColumn(data.x, data.y, data.z);
      }


      // Visual effects for ANY block destruction (tool or landing)
      const color = BLOCK_PROPERTIES[data.blockType].color;
      this.particleSystem.spawnDebris(data.x, data.y, data.z, color, 10);
      this.feedbackSystem.removeHPBar(data.x, data.y, data.z);
      this.toolSystem.propagateShockwaveFromDestruction(data.x, data.y, data.z);

      if (this.shouldQueueUnstableExplosion(data)) {
        this.enqueueExplosion(data.x, data.y, data.z, data.source === 'tool');
      }

      // Queue stability check because world has changed
      this.stabilitySystem.queueCheck(data.x, data.y, data.z);
      if (this.isResolvingExplosion || this.queuedExplosions.length > 0) {
        this.hasPendingPostExplosionStability = true;
      } else {
        this.processUnstableClusters();
      }
    });

    onGameEvent<BlockFallingEvent>(GameEvents.BLOCK_FALLING, (data) => {
      // Refresh hover state as the block at this position is gone
      this.refreshAllHoverStates();

      // Remove physics body when block starts falling as cluster
      const physicsBody = this.physicsWorld.findBlockAt(data.x, data.y, data.z);
      if (physicsBody) {
        this.physicsWorld.removeBody(physicsBody);
      }
    });

    onGameEvent<BlockPlacedEvent>(GameEvents.BLOCK_PLACED, (data) => {
      // Recreate physics body when block is placed (e.g. landing cluster or generation)
      const existing = this.physicsWorld.findBlockAt(data.x, data.y, data.z);
      if (existing) return;

      const block = this.voxelWorld.getBlock(data.x, data.y, data.z);
      if (block && block.type !== BlockType.AIR) {
        this.physicsWorld.createStaticBlock(data.x, data.y, data.z, block);
      }
    });
    // Handle cluster landing - wake up droppables
    onGameEvent<{ blocks: any[], landingY: number }>(GameEvents.CLUSTER_LANDED, (data) => {
      this.audioSystem.handleClusterLanded(data.blocks.length);
      if (this.resourceDropSystem && this.resourceDropSystem.wakeDroppablesInColumn) {
        // Wake up droppables in columns where blocks landed
        for (const block of data.blocks) {
          this.resourceDropSystem.wakeDroppablesInColumn(block.gridX, data.landingY, block.gridZ);
        }
      }
      
      // Refresh hover state as blocks have moved/appeared
      this.refreshAllHoverStates();
    });


    // Handle stability checks triggered by vibrations or other systems

    onGameEvent<{ x: number, y: number, z: number }>(GameEvents.STABILITY_CHECK, (data) => {
      this.stabilitySystem.queueCheck(data.x, data.y, data.z);
      this.processUnstableClusters();
    });

    onGameEvent<{ intensity: number }>(GameEvents.CAMERA_SHAKE, (data) => {
      this.renderer.cameraController.shake(data.intensity);
    });

    onGameEvent<ResourcesDroppedEvent>(GameEvents.RESOURCES_DROPPED, (data) => {
      this.audioSystem.handleResourcesDropped(data);
    });

    onGameEvent<LootCollectedEvent>(GameEvents.LOOT_COLLECTED, (data) => {
      this.audioSystem.handleLootCollected(data);
    });

    onGameEvent<BotStateChangedEvent>(GameEvents.BOT_STATE_CHANGED, (data) => {
      this.audioSystem.handleBotStateChanged(data);
    });

    // Listen for upgrade purchases
    window.addEventListener('upgrade:purchased', this.handleUpgrade.bind(this));

    // Pause on blur / visibility change
    window.addEventListener('blur', () => this.setPaused(true));
    window.addEventListener('focus', () => this.setPaused(false));
    document.addEventListener('visibilitychange', () => {
      this.setPaused(document.hidden);
    });

    useGameStore.subscribe((state, previousState) => {
      if (state.soundEnabled !== previousState.soundEnabled) {
        this.audioSystem.setEnabled(state.soundEnabled);
      }
    });
  }

  private setPaused(paused: boolean): void {
    if (!this.isInitialized) return;

    // Use multiple signals for pause: event param, document visibility, and focus
    const shouldBePaused = paused || document.hidden || !document.hasFocus();

    if (shouldBePaused && !this.isPaused) {
      this.isPaused = true;
      void this.audioSystem.setPaused(true);
      this.renderer.stop();
      this.inputManager?.reset();
      this.pointerInteractions.clear();
      this.toolSystem.stopDrill();
      console.log('Game paused');
    } else if (!shouldBePaused && this.isPaused) {
      this.isPaused = false;
      void this.audioSystem.setPaused(false);
      this.renderer.start();
      console.log('Game resumed');
    }
  }

  async init(): Promise<void> {
    const embedded = this.renderer.embedded;

    this.uiManager.setLoadingProgress(5, 'Loading atlas...');
    await atlasManager.loadAtlas(ATLAS_CONFIG.game.image, ATLAS_CONFIG.game.json);
    
    // Initialize UI systems after atlas is loaded (skip in embedded mode — no WebGLRenderer)
    if (!embedded) {
      this.inventoryUISystem = new InventoryUISystem(
        this.renderer.uiScene,
        this.renderer.uiCamera,
        this.renderer.renderer
      );
      this.avatarUISystem = new AvatarUISystem(
        this.renderer.uiScene,
        this.renderer.uiCamera
      );
      this.uiManager.setAvatarUISystem(this.avatarUISystem);
    }

    this.uiManager.setLoadingProgress(10, 'Initializing physics...');

    // Initialize physics
    await this.physicsWorld.init(this.renderer.scene);
    this.uiManager.setLoadingProgress(30, 'Generating world...');

    // Generate initial column
    this.voxelWorld.generateInitialColumn();
    this.renderer.add(this.voxelWorld.group);
    this.uiManager.setLoadingProgress(60, 'Setting up scene...');

    // Create physics colliders for initial blocks
    this.createPhysicsForBlocks();
    this.uiManager.setLoadingProgress(70, 'Loading sounds...');
    await this.audioSystem.preload();
    this.uiManager.setLoadingProgress(80, 'Finalizing...');

    // In standalone mode, renderer drives the loop via callback
    if (!embedded) {
      this.renderer.setUpdateCallback(this.update.bind(this));
    }

    this.uiManager.update();
    this.uiManager.setLoadingProgress(100, 'Ready!');

    if (!embedded) {
      await new Promise(resolve => setTimeout(resolve, 300));
      this.uiManager.hideLoading();
    }

    this.isInitialized = true;

    const debugState = useGameStore.getState();
    const showDebug = debugState.debugVisuals;
    const isDebugMode = debugState.debugMode;

    this.debugController.setDebugVisuals(showDebug);

    if (isDebugMode) {
      this.debugController.showPerformance(true);
    }

    if (showDebug) {
      this.physicsWorld.createWallVisualization();
      if (this.resourceDropSystem) this.resourceDropSystem.createDebugGizmos();
    }

    if (document.hidden || !document.hasFocus()) {
      this.setPaused(true);
    }

    // Start render loop (no-op in embedded mode)
    this.renderer.start();

    if (this.botHelperSystem && useGameStore.getState().hasBot) {
      if (!this.isPaused) {
        this.botHelperSystem.start();
        console.log('[Game] Bot helper system started from saved state');
      }
    }

    // Instantiate DroppableItemsSystem now that systems are initialized
    const DroppableItemsModule = await import('../systems/DroppableItemsSystem');
    const DroppableItemsSystem = DroppableItemsModule.DroppableItemsSystem;
    this.resourceDropSystem = new DroppableItemsSystem(
      this.renderer.scene,
      this.renderer.cameraController.camera,
      this.physicsWorld,
      this.voxelWorld
    );

    if (this.botHelperSystem && this.resourceDropSystem) {
      this.botHelperSystem.setResourceDropSystem(this.resourceDropSystem);
    }

    console.log(`[Game] Initialized successfully (embedded=${embedded})`);
  }

  private createPhysicsForBlocks(): void {
    const blocks = this.voxelWorld.getAllBlocks();

    for (const block of blocks) {
      if (block.type !== BlockType.AIR) {
        this.physicsWorld.createStaticBlock(block.x, block.y, block.z, block);
      }
    }
  }

  // Main update loop (public so pix3 DeepCoreRunnerScript can call it)
  public update(delta: number): void {
    if (!this.isInitialized || this.isPaused) return;

    const isDebugMode = useGameStore.getState().debugMode;
    const startTime = performance.now();
    const phaseTimes: Record<string, number> = {};

    const measurePhase = (name: string, fn: () => void): void => {
      if (!isDebugMode) {
        fn();
        return;
      }
      const phaseStart = performance.now();
      fn();
      phaseTimes[name] = (phaseTimes[name] ?? 0) + (performance.now() - phaseStart);
    };

    // Update physics
    measurePhase('physics', () => {
      this.physicsWorld.step(delta);
    });

    // Update chunk visibility based on camera position
    measurePhase('chunkVisibility', () => {
      this.voxelWorld.updateChunkVisibility(this.renderer.cameraController.camera);
    });

    // Update particles
    measurePhase('particles', () => {
      this.particleSystem.update(delta);
      this.impactSparkSystem.update(delta);
    });

    measurePhase('audio', () => {
      this.audioSystem.update(delta);
    });

    // Update bot helper system
    measurePhase('botHelper', () => {
      if (this.botHelperSystem) this.botHelperSystem.update(delta);
    });

    // Update droppable items (formerly loot/resources)
    const cameraPos = this.renderer.cameraController.getWorldPosition();

    // Update feedback system (damage numbers, HP bars, sparkles)
    measurePhase('feedback', () => {
      this.feedbackSystem.update(delta);
    });

    // Update resource drops (pass camera position for compatibility)
    measurePhase('droppables', () => {
      if (this.resourceDropSystem) this.resourceDropSystem.update(delta, cameraPos);
    });

    // Update clusters
    measurePhase('clusters', () => {
      this.clusterSystem.update(delta);
    });

    measurePhase('explosions', () => {
      this.processExplosionQueue(performance.now());
    });

    // Update inventory UI
    measurePhase('inventoryUI', () => {
      this.inventoryUISystem.update();
    });

    // Update stability recovery
    measurePhase('stability', () => {
      this.stabilitySystem.update(delta);
    });

    // Update debug gizmos if enabled
    const showDebug = useGameStore.getState().debugVisuals;
    measurePhase('debugGizmos', () => {
      if (showDebug && this.resourceDropSystem) {
        this.resourceDropSystem.updateDebugGizmos();
      }
    });

    // Update physics debug visualization
    measurePhase('physicsDebug', () => {
      this.physicsWorld.updateDebugVisualization(showDebug);
    });

    // Update camera debug frame position
    if (showDebug && this.cameraDebugFrame) {
      this.updateCameraDebugFramePosition();
    }

    // Update wobble decay for floating blocks
    measurePhase('wobbleDecay', () => {
      this.voxelWorld.updateWobbleDecay(delta);
    });

    // Update depth tracking
    measurePhase('depth', () => {
      this.updateDepth();
    });

    // Update turbo fuel consumption
    measurePhase('turbo', () => {
      this.updateTurbo(delta);
    });

    // Update voxel meshes if dirty
    measurePhase('voxelMesh', () => {
      this.voxelWorld.updateInstancedMeshes();
    });

    // Update shaking blocks
    measurePhase('shaking', () => {
      this.voxelWorld.updateShaking(delta);
    });

    // Update wall plane system
    measurePhase('wallPlane', () => {
      this.wallPlaneSystem.updateVisibility(cameraPos);
      this.wallPlaneSystem.update(delta, this.renderer.cameraController.getViewY());
    });

    // Update depth marker system
    measurePhase('depthMarker', () => {
      this.depthMarkerSystem.update(this.renderer.cameraController.getViewY(), cameraPos);
    });

    // Update UI
    measurePhase('uiManager', () => {
      this.uiManager.update(this.renderer.getFPS());
    });

    // Check floating origin
    measurePhase('floatingOrigin', () => {
      this.checkFloatingOrigin();
    });

    const totalUpdateTime = performance.now() - startTime;
    this.frameCount++;

    // Report performance if debug mode is active (throttle to every 10 frames)
    if (isDebugMode && this.frameCount % 10 === 0) {
      const renderMetrics = this.renderer.getMetrics();
      const physicsTime = phaseTimes.physics ?? 0;
      const renderTime = renderMetrics.renderTime ?? 0;
      const totalFrameTime = totalUpdateTime + renderTime;
      const accountedUpdate = Object.values(phaseTimes).reduce((sum, value) => sum + value, 0);

      phaseTimes.otherUpdate = Math.max(0, totalUpdateTime - accountedUpdate);

      this.debugController.updatePerformance({
        ...renderMetrics,
        frameTime: totalFrameTime,
        physicsTime: physicsTime,
        renderTime: renderTime,
        updateTime: totalUpdateTime,
        totalFrameTime,
        profilerPhases: phaseTimes,
      });
    }
  }

  private updateDepth(): void {
    // Find the deepest fully-cleared or partially-cleared level
    let deepest = 0;

    // We scan from top down to find how deep the "empty" space goes
    // A level is considered "reachable" if there's at least one hole in the level above it
    for (let y = 0; y > -2000; y--) {
      let hasAir = false;
      for (let x = GRID.minX; x <= GRID.maxX; x++) {
        for (let z = GRID.minZ; z <= GRID.maxZ; z++) {
          const block = this.voxelWorld.getBlock(x, y, z);
          if (!block || block.type === BlockType.AIR) {
            hasAir = true;
            break;
          }
        }
        if (hasAir) break;
      }

      if (hasAir) {
        deepest = -y;
      } else {
        // Once we hit a completely solid layer, that's our limit
        break;
      }
    }

    if (deepest !== this.currentDepth) {
      this.currentDepth = deepest;
      useGameStore.getState().setDepth(deepest);

      // Move camera target to follow the progress
      // Extend scroll bounds: current depth + 5 blocks for better visibility
      this.renderer.cameraController.setDepth(deepest * 0.5, deepest + 5);

      // Extend column if needed
      if (deepest > GRID.initialHeight - 10) {
        this.voxelWorld.extendColumn(deepest + 20);
      }
    }
  }

  private updateTurbo(delta: number): void {
    const state = useGameStore.getState();
    if (state.turboActive) {
      state.consumeTurboFuel(delta * 10);

      if (state.turboFuel <= 0) {
        this.renderer.disableBloom();
      } else {
        this.renderer.enableBloom();
      }
    }
  }

  private checkFloatingOrigin(): void {
    const result = this.renderer.cameraController.handleFloatingOrigin();

    if (result.needsReset) {
      // Apply offset to all systems
      this.voxelWorld.applyFloatingOriginOffset(result.offset);
      this.physicsWorld.applyFloatingOriginOffset(result.offset);
      if (this.resourceDropSystem) this.resourceDropSystem.applyFloatingOriginOffset(result.offset);
      this.clusterSystem.applyFloatingOriginOffset(result.offset);
      this.wallPlaneSystem.applyFloatingOriginOffset(result.offset);
      this.depthMarkerSystem.applyFloatingOriginOffset(result.offset);

      // Do NOT recreate physics for blocks - they are already moved by applyFloatingOriginOffset
      // createPhysicsForBlocks() would create duplicate bodies
    }
  }

  // Input handlers

  // Single-step rotation (90 degrees)
  private handleRotateStep(direction: -1 | 1): void {
    if (!this.isInitialized) return;
    this.renderer.cameraController.rotateStep(direction);
  }

  // Vertical scroll (camera moves up/down)
  private handleVerticalScroll(deltaY: number): void {
    if (!this.isInitialized) return;
    this.renderer.cameraController.scrollDepth(deltaY);
  }

  // Pointer down - immediate interaction (collect items or damage blocks)
  private handlePointerDown(pointerId: number, screenX: number, screenY: number): void {
    void this.audioSystem.unlock();

    if (!this.isInitialized) return;
    this.lastPointerX = screenX;
    this.lastPointerY = screenY;

    // Check if clicking on inventory UI first - if so, don't process block interactions
    const inventoryIntercepted = this.inventoryUISystem.handlePointerClick(screenX, screenY);
    if (inventoryIntercepted) return;

    // Create/update pointer interaction state
    const interaction: PointerInteraction = {
      id: pointerId,
      screenX,
      screenY,
      hoveredBlock: null,
      isHolding: false,
      drillTarget: null,
      initialScreenX: screenX,
      initialScreenY: screenY,
      initialBlock: null,
    };
    this.pointerInteractions.set(pointerId, interaction);

    // Update hover state for this pointer
    this.updateHoverState(screenX, screenY);

    // Store initial block state
    interaction.initialBlock = this.hoveredBlock;

    // Try to collect hovered resource
    const hoveredResource = this.resourceDropSystem ? this.resourceDropSystem.getHoveredResource() : null;
    if (hoveredResource) {
      this.resourceDropSystem.collectResource(hoveredResource);
      this.particleSystem.spawnCollectSparkle(
        hoveredResource.sprite.position.x,
        hoveredResource.sprite.position.y,
        hoveredResource.sprite.position.z
      );
      return;
    }

    // No separate loot system any more; droppable items handled above

    // Note: Block interaction moved to handlePointerUp for tap tools
    // Hold tools (drill) will be activated by handleHoldStart
  }

  // Pointer move - update hover state and drill target if holding
  private handlePointerMove(pointerId: number, screenX: number, screenY: number, source: 'mouse' | 'pointer' = 'pointer'): void {
    if (!this.isInitialized) return;
    this.lastPointerX = screenX;
    this.lastPointerY = screenY;

    const interaction = this.pointerInteractions.get(pointerId);
    if (interaction) {
      interaction.screenX = screenX;
      interaction.screenY = screenY;

      // If drilling, update drill target
      if (interaction.isHolding && interaction.drillTarget) {
        const result = this.raycastBlock(screenX, screenY);
        if (result) {
          this.setToolHpBarTarget(result.block.x, result.block.y, result.block.z, true);
          // Update drill target if changed
          const newTarget = result.block;
          if (newTarget.x !== interaction.drillTarget.x ||
            newTarget.y !== interaction.drillTarget.y ||
            newTarget.z !== interaction.drillTarget.z) {
            interaction.drillTarget = { x: newTarget.x, y: newTarget.y, z: newTarget.z };
            this.toolSystem.updateDrillTarget(newTarget.x, newTarget.y, newTarget.z, result.point);
          }
        }
      }
    }

// Update hover state
        if (source === 'mouse') { this.updateHoverState(screenX, screenY); }
  }

  // Pointer up - end interaction
  private handlePointerUp(pointerId: number, screenX: number, screenY: number): void {
    if (!this.isInitialized) return;
    const interaction = this.pointerInteractions.get(pointerId);
    if (interaction) {
      // Hit block with tap tool on pointer release - but only if:
      // 1. Block is the same as when pointer was pressed
      // 2. Pointer didn't move too much (to prevent hitting during swipes)
      const maxPointerDrift = 90; // pixels
      const pointerDriftX = Math.abs(screenX - interaction.initialScreenX);
      const pointerDriftY = Math.abs(screenY - interaction.initialScreenY);
      const pointerDrift = Math.sqrt(pointerDriftX * pointerDriftX + pointerDriftY * pointerDriftY);

      const blockIsStable = this.hoveredBlock && interaction.initialBlock &&
        this.hoveredBlock.x === interaction.initialBlock.x &&
        this.hoveredBlock.y === interaction.initialBlock.y &&
        this.hoveredBlock.z === interaction.initialBlock.z;

      if (blockIsStable && pointerDrift <= maxPointerDrift) {
        const tool = useGameStore.getState().currentTool;
        const toolProps = TOOL_PROPERTIES[tool];

        // Check multi-touch permission
        if (!toolProps.multiTouchAllowed && this.pointerInteractions.size > 1) {
          // Multi-touch not allowed, skip tap
        } else if (toolProps.inputMode === 'tap') {
          // Raycast to get exact hit point
          const result = this.raycastBlock(screenX, screenY);
          if (result) {
            this.setToolHpBarTarget(result.block.x, result.block.y, result.block.z, false);
            this.toolSystem.useTapTool(result.block.x, result.block.y, result.block.z, result.point);
            this.uiManager.playAttackAnimation();
            this.feedbackSystem.releaseFocusedHPBar();
            this.currentToolHpBarTarget = null;
          }
        }
      }

      // Clear hovered block visual if this pointer was hovering it
      if (interaction.hoveredBlock) {
        this.voxelWorld.resetBlockColor(
          interaction.hoveredBlock.x,
          interaction.hoveredBlock.y,
          interaction.hoveredBlock.z
        );
      }
    }

    this.pointerInteractions.delete(pointerId);

    // Refresh hover state if there are still active pointers
    if (this.pointerInteractions.size > 0) {
      const firstPointer = this.pointerInteractions.values().next().value as PointerInteraction;
      this.updateHoverState(firstPointer.screenX, firstPointer.screenY);
    } else {
      // Clear all hover states
      if (this.resourceDropSystem) this.resourceDropSystem.clearHover();
      if (this.hoveredBlock) {
        this.voxelWorld.resetBlockColor(this.hoveredBlock.x, this.hoveredBlock.y, this.hoveredBlock.z);
        this.hoveredBlock = null;

        // Clear block debug info
        this.uiManager.updateBlockDebugInfo(null);
      }
    }
  }

  // Hold start - begin drilling
  private handleHoldStart(pointerId: number, screenX: number, screenY: number): void {
    if (!this.isInitialized) return;
    const interaction = this.pointerInteractions.get(pointerId);
    if (!interaction) return;

    interaction.isHolding = true;

    const tool = useGameStore.getState().currentTool;
    const toolProps = TOOL_PROPERTIES[tool];

    if (!toolProps.multiTouchAllowed) {
      for (const [id, other] of this.pointerInteractions) {
        if (id !== pointerId && other.isHolding && other.drillTarget) {
          return;
        }
      }
    }

    if (tool === ToolType.DRILL) {
      const result = this.raycastBlock(screenX, screenY);
      if (result) {
        interaction.drillTarget = {
          x: result.block.x,
          y: result.block.y,
          z: result.block.z
        };
        this.setToolHpBarTarget(result.block.x, result.block.y, result.block.z, true);
        this.toolSystem.startDrill(result.block.x, result.block.y, result.block.z, result.point);
      }
    }
  }

  // Hold end - stop drilling
  private handleHoldEnd(pointerId: number): void {
    if (!this.isInitialized) return;
    const interaction = this.pointerInteractions.get(pointerId);
    if (!interaction) return;

    if (interaction.isHolding && interaction.drillTarget) {
      this.toolSystem.stopDrill();
    }

    interaction.isHolding = false;
    interaction.drillTarget = null;
    this.currentToolHpBarTarget = null;
    this.feedbackSystem.clearFocusedHPBar();
  }

  // Central hover state update - called on pointer move and scene changes
  private updateHoverState(screenX: number, screenY: number): void {
    const resourceTargets = this.resourceDropSystem ? this.resourceDropSystem.getResourceTargets() : [];

    for (const target of resourceTargets) {
      target.updateMatrixWorld();
    }

    const resourceIntersects = this.renderer.raycast(screenX, screenY, resourceTargets);
    const blockHit = this.raycastBlock(screenX, screenY, {
      allowLocked: true,
      requireInteractable: false,
    });

    const resourceHit = resourceIntersects.length > 0 ? resourceIntersects[0] : null;
    const preferResource = !!resourceHit && (!blockHit || resourceHit.distance <= blockHit.distance);

    let hitBlock: VoxelData | null = null;

    if (preferResource && resourceHit) {
      const resourceHitMesh = resourceHit.object as THREE.Object3D;
      if (this.resourceDropSystem) {
        this.resourceDropSystem.setHoveredResourceTarget(resourceHitMesh);
        const hoveredResource = this.resourceDropSystem.getHoveredResource();
        this.uiManager.updateResourceDebugInfo(hoveredResource);
      }
      this.uiManager.updateItemDebugInfo(null);
    } else if (blockHit) {
      hitBlock = blockHit.block;
      if (this.resourceDropSystem) this.resourceDropSystem.clearHover();
      this.uiManager.updateItemDebugInfo(null);
      this.uiManager.updateResourceDebugInfo(null);
    }

    if (hitBlock) {
      const sameBlock = this.hoveredBlock && 
                       this.hoveredBlock.x === hitBlock.x && 
                       this.hoveredBlock.y === hitBlock.y && 
                       this.hoveredBlock.z === hitBlock.z;

      if (this.hoveredBlock && !sameBlock) {
        this.voxelWorld.resetBlockColor(this.hoveredBlock.x, this.hoveredBlock.y, this.hoveredBlock.z);
      }

      const isInteractable = this.voxelWorld.isBlockInteractable(hitBlock.x, hitBlock.y, hitBlock.z);
      
      // Only set color if it's a new hover or if we explicitly want to refresh it
      if (!sameBlock && isInteractable) {
        this.voxelWorld.setBlockColor(hitBlock.x, hitBlock.y, hitBlock.z, 1.3, 1.3, 1.3);
      }

      this.hoveredBlock = hitBlock;

      this.feedbackSystem.setHoveredBlock(
        hitBlock.x, hitBlock.y, hitBlock.z,
        hitBlock.hp, BLOCK_PROPERTIES[hitBlock.type].hp,
        isInteractable
      );

      const chunkId = this.voxelWorld.getChunkId(hitBlock.y);
      this.uiManager.updateBlockDebugInfo(hitBlock, chunkId);
    } else {
      if (this.hoveredBlock) {
        this.voxelWorld.resetBlockColor(this.hoveredBlock.x, this.hoveredBlock.y, this.hoveredBlock.z);
        this.hoveredBlock = null;
        this.feedbackSystem.setHoveredBlock(null, null, null);
      }

      this.uiManager.updateBlockDebugInfo(null);
    }

    if (!resourceHit && !blockHit) {
      if (this.resourceDropSystem) this.resourceDropSystem.clearHover();
      this.uiManager.updateItemDebugInfo(null);
      this.uiManager.updateResourceDebugInfo(null);
    }
  }

  // Refresh hover states for all active pointers (called on scene changes)
  private refreshAllHoverStates(): void {
    // Force update all resource matrices
    const resourceTargets = this.resourceDropSystem ? this.resourceDropSystem.getResourceTargets() : [];
    for (const target of resourceTargets) {
      target.updateMatrixWorld();
    }

    // Update hover for the last known pointer position
    if (this.lastPointerX !== 0 || this.lastPointerY !== 0) {
      this.updateHoverState(this.lastPointerX, this.lastPointerY);
    }
  }

  private getScreenRay(screenX: number, screenY: number): THREE.Ray {
    this.pointerNdc.set(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );
    this.pointerRaycaster.setFromCamera(this.pointerNdc, this.renderer.cameraController.camera);
    this.pointerRay.copy(this.pointerRaycaster.ray);
    return this.pointerRay;
  }

  private raycastBlock(
    screenX: number,
    screenY: number,
    options: { allowLocked?: boolean; requireInteractable?: boolean } = {}
  ): { block: VoxelData; point: THREE.Vector3; distance: number } | null {
    const { allowLocked = false, requireInteractable = true } = options;
    const ray = this.getScreenRay(screenX, screenY);
    const maxDistance = this.renderer.cameraController.camera.far;
    const hit = this.voxelWorld.raycastBlockByCube(ray, maxDistance);
    if (!hit) return null;

    if (!allowLocked && this.voxelWorld.isBlockLocked(hit.block.x, hit.block.y, hit.block.z)) {
      return null;
    }

    if (requireInteractable && !this.voxelWorld.isBlockInteractable(hit.block.x, hit.block.y, hit.block.z)) {
      return null;
    }

    return hit;
  }

  private processUnstableClusters(): void {
    // Skip stability checks while world is being extended
    // This prevents blocks from incorrectly losing anchor status
    // when _lowestY changes during world generation
    if (this.voxelWorld.isExtending) {
      return;
    }

    // Run stability check - get groups of connected unstable blocks
    const unstableClusters = this.stabilitySystem.getUnstableClusters();

    // Convert unstable groups to falling clusters
    for (const clusterBlocks of unstableClusters) {
      const extractedBlocks = this.voxelWorld.extractClusterBlocks(clusterBlocks);
      this.clusterSystem.createCluster(extractedBlocks);
    }
  }

  private handleBlockDamaged(data: BlockDamagedEvent): void {
    const props = BLOCK_PROPERTIES[data.blockType];
    const maxHp = props.hp;

    // Apply wobble from damage if block still exists in world
    const block = this.voxelWorld.getBlockIncludingDying(data.x, data.y, data.z);
    if (block) {
      this.toolSystem.onBlockDamage(block, data.damage);
      // Pop block (scale animation). Only flash white on direct hit (has hitPoint)
      const shouldFlash = !!data.hitPoint;
      this.voxelWorld.shakeBlock(data.x, data.y, data.z, 0.08, 0.8, shouldFlash);
    }

    // Spawn dedicated sparks only for direct tool hits with a contact point.
    if (data.hitPoint && data.damage > 0) {
      this.impactSparkSystem.spawn(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z);
    }

    // Show damage number
    this.feedbackSystem.showDamageNumber(data.x, data.y, data.z, data.damage, data.damage >= 10);

    // Show HP bar only for the block actively being hit by the player's current tool.
    if (
      this.currentToolHpBarTarget &&
      this.currentToolHpBarTarget.x === data.x &&
      this.currentToolHpBarTarget.y === data.y &&
      this.currentToolHpBarTarget.z === data.z
    ) {
      if (data.remainingHp > 0) {
        const display = this.currentToolHpBarTarget.displayPosition;
        this.feedbackSystem.showFocusedHPBar(
          data.x,
          data.y,
          data.z,
          data.remainingHp,
          maxHp,
          display.x,
          display.y,
          display.z,
          data.previousHp
        );

        if (!this.currentToolHpBarTarget.persistent) {
          this.feedbackSystem.releaseFocusedHPBar();
          this.currentToolHpBarTarget = null;
        }
      } else {
        this.feedbackSystem.clearFocusedHPBar();
        this.currentToolHpBarTarget = null;
      }
    }

  }

  private enqueueExplosion(x: number, y: number, z: number, immediate: boolean): void {
    const key = `${x},${y},${z}`;
    if (this.queuedExplosionKeys.has(key)) {
      return;
    }

    const now = performance.now();
    let triggerTime = now;
    if (!immediate) {
      const baseTime = Math.max(now, this.lastQueuedExplosionTime);
      triggerTime = baseTime + UNSTABLE_BLOCKS.chainReactionDelayMs;
    }

    this.lastQueuedExplosionTime = Math.max(this.lastQueuedExplosionTime, triggerTime);
    this.queuedExplosionKeys.add(key);
    this.queuedExplosions.push({ x, y, z, triggerTime });
    this.queuedExplosions.sort((a, b) => a.triggerTime - b.triggerTime);
  }

  private shouldQueueUnstableExplosion(data: BlockDestroyedEvent): boolean {
    if (data.blockType !== BlockType.UNSTABLE) {
      return false;
    }

    if (data.source === 'tool') {
      return true;
    }

    if (data.source === 'explosion') {
      return false;
    }

    if (UNSTABLE_BLOCKS.explodeOnlyFromToolHits) {
      return false;
    }

    if (data.source === 'fallImpact' && !UNSTABLE_BLOCKS.explodeOnZeroHpFromFalling) {
      return false;
    }

    return true;
  }

  private processExplosionQueue(now: number): void {
    let processed = 0;
    while (
      this.queuedExplosions.length > 0 &&
      this.queuedExplosions[0].triggerTime <= now &&
      processed < UNSTABLE_BLOCKS.maxQueuedExplosionsPerFrame
    ) {
      const explosion = this.queuedExplosions.shift()!;
      this.queuedExplosionKeys.delete(`${explosion.x},${explosion.y},${explosion.z}`);
      this.resolveQueuedExplosion(explosion.x, explosion.y, explosion.z);
      processed++;
    }

    if (!this.isResolvingExplosion && this.queuedExplosions.length === 0 && this.hasPendingPostExplosionStability) {
      this.hasPendingPostExplosionStability = false;
      this.processUnstableClusters();
    }
  }

  private resolveQueuedExplosion(x: number, y: number, z: number): void {
    const existingBlock = this.voxelWorld.getBlockIncludingDying(x, y, z);
    if (existingBlock && !existingBlock.isDying && existingBlock.type === BlockType.UNSTABLE) {
      this.voxelWorld.damageBlock(x, y, z, Math.max(1, Math.ceil(existingBlock.hp)), undefined, 'explosion');
    }

    const props = BLOCK_PROPERTIES[BlockType.UNSTABLE];
    if (!props.explosionRadius || !props.explosionDamage) {
      return;
    }

    this.triggerExplosion(x, y, z, props.explosionRadius, props.explosionDamage);
  }

  private triggerExplosion(x: number, y: number, z: number, radius: number, damage: number): void {
    // Blocks are stored at coordinates: GRID.minX + cellX (e.g., -1.5, -0.5, 0.5, 1.5)
    // Convert world coords to cell indices
    const cellMinX = Math.floor(x - radius - GRID.minX);
    const cellMaxX = Math.ceil(x + radius - GRID.minX);
    const cellMinY = Math.floor(y - radius);
    const cellMaxY = Math.ceil(y + radius);
    const cellMinZ = Math.floor(z - radius - GRID.minZ);
    const cellMaxZ = Math.ceil(z + radius - GRID.minZ);

    const radiusSq = radius * radius;
    
    // Play explosion effect
    const color = BLOCK_PROPERTIES[BlockType.UNSTABLE].color;
    this.particleSystem.spawnDebris(x, y, z, color, 50);
    this.impactSparkSystem.spawnExplosion(x, y, z);
    this.renderer.cameraController.shake(0.8);
    this.isResolvingExplosion = true;

    try {
      for (let cellX = cellMinX; cellX <= cellMaxX; cellX++) {
        for (let cellY = cellMinY; cellY <= cellMaxY; cellY++) {
          for (let cellZ = cellMinZ; cellZ <= cellMaxZ; cellZ++) {
            // Convert cell indices to world coordinates
            const worldX = GRID.minX + cellX;
            const worldY = cellY;
            const worldZ = GRID.minZ + cellZ;

            // Skip if outside grid bounds
            if (cellX < 0 || cellX > GRID.maxX - GRID.minX ||
                cellZ < 0 || cellZ > GRID.maxZ - GRID.minZ) {
              continue;
            }

            // Skip the explosion center
            if (Math.abs(worldX - x) < 0.01 && Math.abs(worldY - y) < 0.01 && Math.abs(worldZ - z) < 0.01) continue;

            // Distance from center to center
            const dx = worldX - x;
            const dy = worldY - y;
            const dz = worldZ - z;
            const currentDistSq = dx * dx + dy * dy + dz * dz;

            if (currentDistSq <= radiusSq) {
              const block = this.voxelWorld.getBlock(worldX, worldY, worldZ);

              if (block && block.type !== BlockType.AIR && block.type !== BlockType.BEDROCK) {
                 if (block.type === BlockType.UNSTABLE) {
                   this.enqueueExplosion(worldX, worldY, worldZ, false);
                   continue;
                 }

                 // Reduce damage based on distance from epicenter
                 const distance = Math.sqrt(currentDistSq);
                 const falloff = Math.max(0.1, 1 - (distance / radius));
                 const appliedDamage = Math.floor(damage * falloff);

                 if (appliedDamage > 0) {
                   this.voxelWorld.damageBlock(worldX, worldY, worldZ, appliedDamage, undefined, 'explosion');
                 }
              }
            }
          }
        }
      }
    } finally {
      this.isResolvingExplosion = false;
    }

    if (this.queuedExplosions.length === 0 && this.hasPendingPostExplosionStability) {
      this.hasPendingPostExplosionStability = false;
      this.processUnstableClusters();
    }
  }

  private handleUpgrade(event: Event): void {
    const detail = (event as CustomEvent).detail;

    if (detail.upgrade === 'bot') {
      if (this.botHelperSystem) {
        this.botHelperSystem.start();
      }
    }
  }

  // Dispose
  dispose(): void {
    this.renderer.dispose();
    if (this.inputManager) this.inputManager.dispose();
    this.voxelWorld.dispose();
    this.physicsWorld.dispose();
    this.toolSystem.dispose();
    this.particleSystem.dispose();
    this.impactSparkSystem.dispose();
    this.botHelperSystem.dispose();
    if (this.resourceDropSystem && this.resourceDropSystem.dispose) {
      this.resourceDropSystem.dispose();
    }
    this.feedbackSystem.dispose();
    this.inventoryUISystem.dispose();
    this.avatarUISystem.dispose();
    this.wallPlaneSystem.dispose();
    this.uiManager.dispose();
    this.debugController.dispose();

    window.removeEventListener('upgrade:purchased', this.handleUpgrade.bind(this));
  }

  private toggleDebugVisuals(): void {
    const state = useGameStore.getState();
    state.toggleDebugVisuals();

    const showDebug = useGameStore.getState().debugVisuals;
    this.debugController.setDebugVisuals(showDebug);

    if (showDebug) {
      // Create wall visualization (automatically adds to scene)
      this.physicsWorld.createWallVisualization();

      // Create resource gizmos
      if (this.resourceDropSystem) this.resourceDropSystem.createDebugGizmos();
      
      // Update bot debug visuals
      if (this.botHelperSystem) this.botHelperSystem.setDebugMode(true);

      // Create camera debug frame
      this.createCameraDebugFrame();
    } else {
      // Remove wall visualization (automatically removes from scene)
      this.physicsWorld.removeWallVisualization();

      // Remove resource gizmos
      if (this.resourceDropSystem) this.resourceDropSystem.removeDebugGizmos();
      
      // Update bot debug visuals
      if (this.botHelperSystem) this.botHelperSystem.setDebugMode(false);

      // Remove camera debug frame
      this.destroyCameraDebugFrame();
    }
  }

  private createCameraDebugFrame(): void {
    // Destroy previous frame if it exists
    if (this.cameraDebugFrame) {
      this.destroyCameraDebugFrame();
    }

    const aspect = window.innerWidth / window.innerHeight;
    const bounds = this.renderer.cameraController.getFrustumBoundsAt1xZoom(aspect);
    
    // Create a wireframe rectangle at the base frustum size
    // The rectangle is in the XZ plane
    const geometry = new THREE.BufferGeometry();
    
    // Define the four corners of the view rectangle
    const halfWidth = bounds.halfWidth;
    const halfHeight = bounds.halfHeight;
    
    // Create vertices for the rectangle edges (using Y=0, will be positioned later)
    const vertices = [
      // Near edge (closer corners)
      -halfWidth, 0, -halfHeight,
      halfWidth, 0, -halfHeight,
      
      // Far edge (farther corners)
      -halfWidth, 0, halfHeight,
      halfWidth, 0, halfHeight,
    ];
    
    const indices = [
      // Near edge
      0, 1,
      // Far edge
      2, 3,
      // Left edge
      0, 2,
      // Right edge
      1, 3,
    ];
    
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    
    // Create line material (bright color for visibility)
    const material = new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 2,
      fog: false,
      transparent: true,
      opacity: 0.8,
    });
    
    // Create line segments
    this.cameraDebugFrame = new THREE.LineSegments(geometry, material);
    
    // Position at Y=0 (ground level) and rotate to match camera yaw
    this.cameraDebugFrame.position.y = 0;
    this.cameraDebugFrame.rotation.y = this.renderer.cameraController.getCurrentYaw();
    
    this.renderer.scene.add(this.cameraDebugFrame);
  }

  private destroyCameraDebugFrame(): void {
    if (this.cameraDebugFrame) {
      this.renderer.scene.remove(this.cameraDebugFrame);
      (this.cameraDebugFrame.geometry as THREE.BufferGeometry).dispose();
      (this.cameraDebugFrame.material as THREE.LineBasicMaterial).dispose();
      this.cameraDebugFrame = null;
    }
  }

  private updateCameraDebugFramePosition(): void {
    if (!this.cameraDebugFrame) return;

    // Keep frame at Y=0 (ground level)
    this.cameraDebugFrame.position.y = 0;

    // Rotate frame to match camera's yaw
    const cameraYaw = this.renderer.cameraController.getCurrentYaw();
    this.cameraDebugFrame.rotation.y = cameraYaw;
  }

  private setToolHpBarTarget(x: number, y: number, z: number, persistent: boolean): void {
    const displayPosition = this.buildToolHpBarPosition(x, y, z);
    this.currentToolHpBarTarget = { x, y, z, displayPosition, persistent };
  }

  private buildToolHpBarPosition(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(
      x,
      y + gameplayConfig.feedback.hpBars.offsetY + 0.7,
      z
    );
  }
}
