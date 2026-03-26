import {
  BotStateType,
  type BotEntity,
  type BotConfig,
  BlockType,
  GameEvents,
  emitGameEvent,
} from '../core/Types';
import * as THREE from 'three';
import { DroppableItemsSystem } from './DroppableItemsSystem';

export class BotStateMachine {
  private bot: BotEntity;
  private droppableItemsSystem: DroppableItemsSystem | null;
  private config: BotConfig;

  constructor(bot: BotEntity, config: BotConfig, droppableItemsSystem: DroppableItemsSystem | null = null) {
    this.bot = bot;
    this.config = config;
    this.droppableItemsSystem = droppableItemsSystem;
  }

  public setDroppableItemsSystem(system: DroppableItemsSystem): void {
    this.droppableItemsSystem = system;
  }

  update(deltaTime: number): void {
    const currentState = this.bot.state.state;
    // Removed spam logging - will log only on state changes
    switch (currentState) {
      case BotStateType.IDLE:
        this.handleIdleState(deltaTime);
        break;
      case BotStateType.SEARCHING:
        this.handleSearchingState(deltaTime);
        break;
      case BotStateType.COLLECTING:
        this.handleCollectingState(deltaTime);
        break;
      case BotStateType.FALLING:
        this.handleFallingState(deltaTime);
        break;
      case BotStateType.ERROR:
        this.handleErrorState(deltaTime);
        break;
      case BotStateType.RECOVERING:
        this.handleRecoveringState(deltaTime);
        break;
    }

    this.updateVisualState();
  }

  private handleIdleState(_deltaTime: number): void {
    const now = performance.now();
    
    // Check if it's time to search for resources
    if (now - this.bot.state.lastSearchTime > this.config.collection.searchInterval * 1000) {
      this.transitionTo(BotStateType.SEARCHING);
      this.bot.state.lastSearchTime = now;
    }
    
    if (this.bot.isStuck) {
      this.transitionTo(BotStateType.ERROR);
    }
  }

  private handleSearchingState(_deltaTime: number): void {
    //console.log('[Bot] Searching for items...');
    // 1. Ищем ближайший предмет (теперь по всей карте)
    const item = this.findClosestItem();
    
    if (item) {
      // Сохраняем ссылку на объект для проверок
      this.bot.state.itemTarget = item.hitMesh;
      
      // 2. ВАЖНО: Задаем цель для навигации!
      // Без этого бот не будет знать, куда идти
      this.bot.state.target = {
        x: item.sprite.position.x,
        y: item.sprite.position.y,
        z: item.sprite.position.z,
        blockType: BlockType.AIR // Тип блока не важен, главное координаты
      };

      this.transitionTo(BotStateType.COLLECTING);
      
      if (this.config.debug.logStateChanges) {
        console.log(`[Bot] Target set to item: ${item.type} at ${item.sprite.position.toArray()}`);
      }
    } else {
      // Если предметов нет — возвращаемся в IDLE
      this.transitionTo(BotStateType.IDLE);
    }
  }

  private handleCollectingState(_deltaTime: number): void {
    // Если предмет исчез или был собран кем-то другим
    if (!this.bot.state.itemTarget || 
        this.bot.state.itemTarget.parent === null || 
        (this.droppableItemsSystem && this.droppableItemsSystem.isItemCollected(this.bot.state.itemTarget))) {
      
      this.bot.state.itemTarget = undefined;
      this.bot.state.target = undefined; // Сбрасываем цель движения
      this.transitionTo(BotStateType.SEARCHING);
      return;
    }

    // Примечание: Само движение обрабатывается в BotNavigation (через state.target),
    // а сбор предметов — в BotHelperSystem (через checkProximityCollection).
    // Здесь мы просто ждем, пока это произойдет.

    if (this.bot.isStuck) {
      this.transitionTo(BotStateType.ERROR);
    }
  }

  private handleFallingState(_deltaTime: number): void {
    // Only transition to IDLE when falling is actually complete AND landing is done
    if (!this.bot.isFalling && !this.bot.state.isLanding) {
      this.transitionTo(BotStateType.IDLE);
    }
  }

  private handleErrorState(deltaTime: number): void {
    this.bot.state.stuckTimer += deltaTime;
    
    if (this.config.debug.logErrors && Math.floor(this.bot.state.stuckTimer) === 1) {
       // Log once per stuck event roughly
       console.log(`[Bot] Stuck... waiting for rescue.`);
    }

    if (this.bot.state.stuckTimer > this.config.navigation.stuckDetectionTime) {
      this.transitionTo(BotStateType.RECOVERING);
      this.bot.state.stuckTimer = 0;
      this.bot.state.errorCount++;
    }
  }

  private handleRecoveringState(deltaTime: number): void {
    this.bot.state.recoveryTimer += deltaTime;
    
    if (this.bot.state.recoveryTimer > this.config.navigation.recoveryTime) {
      this.transitionTo(BotStateType.SEARCHING);
      this.bot.state.recoveryTimer = 0;
      this.bot.state.itemTarget = undefined;
      this.bot.state.target = undefined;
    }
  }

  private findClosestItem() {
    //console.log('[Bot] Searching for closest item...');
    if (!this.droppableItemsSystem) return null;
    
    const items = (this.droppableItemsSystem as any).getActiveItems();
    if (items.length === 0) return null;
    const now = performance.now();

    let closest = null;
    let minDist = Infinity;
    
    for (const item of items) {
      if (item.collected) continue;
      const unreachableUntil = this.getUnreachableUntil(item.hitMesh);
      if (unreachableUntil > now) continue;
      
      const dist = this.bot.state.position.distanceTo(item.sprite.position);
      
      // ИЗМЕНЕНИЕ: Убрана проверка dist < this.config.navigation.scanRange
      // Теперь бот видит предметы на любом расстоянии
      if (dist < minDist) {
        minDist = dist;
        closest = item;
      }
    }
    
    return closest;
  }

  private getUnreachableUntil(target: THREE.Object3D): number {
    const value = target.userData?.botUnreachableUntil;
    return typeof value === 'number' ? value : 0;
  }

  private transitionTo(newState: BotStateType): void {
    const previousState = this.bot.state.state;
    if (previousState === newState) {
      return;
    }

    this.bot.state.state = newState;

    emitGameEvent(GameEvents.BOT_STATE_CHANGED, {
      previousState,
      nextState: newState,
    });
    
    if (newState === BotStateType.SEARCHING || newState === BotStateType.RECOVERING || newState === BotStateType.COLLECTING) {
      this.bot.isStuck = false;
      this.bot.state.stuckTimer = 0;
    }
    
    if (this.config.debug.logStateChanges) {
      console.log(`[Bot] State changed: ${previousState} → ${newState}`);
    }
  }

  private updateVisualState(): void {
    // Handled by renderer update
  }

  public getState(): BotStateType {
    return this.bot.state.state;
  }

  public getErrorCount(): number {
    return this.bot.state.errorCount;
  }

  public resetErrorCount(): void {
    this.bot.state.errorCount = 0;
  }

  public isStuck(): boolean {
    return this.bot.isStuck;
  }

  public isFalling(): boolean {
    return this.bot.isFalling;
  }

  public setPosition(position: THREE.Vector3): void {
    this.bot.state.position.copy(position);
  }

  public getPosition(): THREE.Vector3 {
    return this.bot.state.position;
  }
}