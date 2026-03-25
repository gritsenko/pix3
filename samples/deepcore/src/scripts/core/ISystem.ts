import * as THREE from 'three';

export interface ISystem {
  update(deltaTime: number): void;
  dispose(): void;
}

export interface IPhysicsSystem extends ISystem {
  applyFloatingOriginOffset(offset: THREE.Vector3): void;
}

export interface IRenderableSystem extends ISystem {
  update(deltaTime: number): void;
  dispose(): void;
}

export interface IInputHandler {
  handlePointerDown(pointerId: number, screenX: number, screenY: number): void;
  handlePointerMove(pointerId: number, screenX: number, screenY: number, source?: 'mouse' | 'pointer'): void;
  handlePointerUp(pointerId: number, screenX: number, screenY: number): void;
  reset(): void;
}
