import type { NodeBase } from '@/core/NodeBase';
import { injectable } from '@/fw/di';       
export type TransformMode = 'translate' | 'rotate' | 'scale';

@injectable()
export class ViewportRendererService {
  updateNodeTransform(node: NodeBase) {
    throw new Error('Method not implemented.');
  }
  updateSelection() {
    throw new Error('Method not implemented.');
  }
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    //this.context = canvas.getContext('2d');
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setTransformMode(mode: TransformMode): void {
    // Set the transform mode for the viewport
  }

  dispose(): void {
    this.canvas = undefined;
    this.context = undefined;
  }
}
