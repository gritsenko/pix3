import * as THREE from 'three';

export interface PoolConfig {
  initialSize: number;
  expandAmount: number;
  maxPoolSize: number;
  maxActive: number;
}

export interface PoolItem {
  visible: boolean;
}

export type PoolFactory<T> = () => T;

export class ObjectPool<T extends PoolItem> {
  private items: T[] = [];
  private pool: T[] = [];
  private factory: PoolFactory<T>;
  private config: PoolConfig;
  private scene?: THREE.Scene;

  constructor(
    factory: PoolFactory<T>,
    config: PoolConfig,
    scene?: THREE.Scene
  ) {
    this.factory = factory;
    this.config = config;
    this.scene = scene;
    this.expand(config.initialSize);
  }

  private expand(count: number): void {
    for (let i = 0; i < count; i++) {
      const item = this.factory();
      item.visible = false;
      this.pool.push(item);
      if (this.scene && (item as unknown as THREE.Object3D).isObject3D) {
        this.scene.add(item as unknown as THREE.Object3D);
      }
    }
  }

  acquire(): T | null {
    let item = this.pool.pop();
    if (!item && this.pool.length + this.items.length < this.config.maxActive) {
      this.expand(this.config.expandAmount);
      item = this.pool.pop();
    }
    if (item) {
      item.visible = true;
    }
    return item || null;
  }

  release(item: T): void {
    item.visible = false;
    this.pool.push(item);
  }

  track(item: T): void {
    this.items.push(item);
  }

  untrack(item: T): void {
    const index = this.items.indexOf(item);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  getActiveCount(): number {
    return this.items.length;
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  clear(): void {
    for (const item of this.items) {
      this.release(item);
    }
    this.items.length = 0;
  }

  dispose(): void {
    this.clear();
    if (this.scene) {
      for (const item of this.pool) {
        if ((item as unknown as THREE.Object3D).isObject3D) {
          this.scene.remove(item as unknown as THREE.Object3D);
        }
      }
    }
    this.pool.length = 0;
  }
}
