import {
  GameEvents,
  onGameEvent,
  BlockDestroyedEvent,
  BlockDamagedEvent,
  BlockFallingEvent,
  BlockPlacedEvent,
  GameEventType,
} from './Types';
import type { ClusterBlockData } from '../world/types';

export type EventHandler<T> = (detail: T) => void;

interface EventSubscription {
  event: GameEventType;
  unsubscribe: () => void;
}

export class EventCoordinator {
  private subscriptions: EventSubscription[] = [];
  private handlers: Map<GameEventType, Set<EventHandler<unknown>>> = new Map();

  subscribe<T>(event: GameEventType, handler: EventHandler<T>): () => void {
    const wrappedHandler = (detail: T) => {
      handler(detail);
    };

    const unsubscribe = onGameEvent<T>(event, wrappedHandler);

    const subscription: EventSubscription = {
      event,
      unsubscribe,
    };

    this.subscriptions.push(subscription);

    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(wrappedHandler as EventHandler<unknown>);

    return () => {
      this.unsubscribe(subscription);
    };
  }

  private unsubscribe(subscription: EventSubscription): void {
    const index = this.subscriptions.indexOf(subscription);
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
    }
    subscription.unsubscribe();
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];
    this.handlers.clear();
  }

  // Convenience methods for common game events
  onBlockDestroyed(handler: EventHandler<BlockDestroyedEvent>): () => void {
    return this.subscribe(GameEvents.BLOCK_DESTROYED, handler);
  }

  onBlockDamaged(handler: EventHandler<BlockDamagedEvent>): () => void {
    return this.subscribe(GameEvents.BLOCK_DAMAGED, handler);
  }

  onBlockFalling(handler: EventHandler<BlockFallingEvent>): () => void {
    return this.subscribe(GameEvents.BLOCK_FALLING, handler);
  }

  onBlockPlaced(handler: EventHandler<BlockPlacedEvent>): () => void {
    return this.subscribe(GameEvents.BLOCK_PLACED, handler);
  }

  onStabilityCheck(handler: EventHandler<{ x: number; y: number; z: number }>): () => void {
    return this.subscribe(GameEvents.STABILITY_CHECK, handler);
  }

  onClusterLanded(handler: EventHandler<{ blocks: ClusterBlockData[]; landingY: number }>): () => void {
    return this.subscribe(GameEvents.CLUSTER_LANDED, handler);
  }

  onCameraShake(handler: EventHandler<{ intensity: number }>): () => void {
    return this.subscribe(GameEvents.CAMERA_SHAKE, handler);
  }
}
