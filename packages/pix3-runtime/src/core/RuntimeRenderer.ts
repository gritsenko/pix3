import { WebGLRenderer, Scene, Camera, PCFSoftShadowMap } from 'three';

export interface RuntimeRendererOptions {
  antialias?: boolean;
  pixelRatio?: number;
  clearColor?: string;
  shadows?: boolean;
}

export class RuntimeRenderer {
  private renderer: WebGLRenderer;
  private canvas: HTMLCanvasElement;

  constructor(options: RuntimeRendererOptions = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: options.antialias ?? true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(options.pixelRatio ?? window.devicePixelRatio);
    this.renderer.setClearColor(options.clearColor ?? '#000000');

    if (options.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
    }
  }

  get domElement(): HTMLCanvasElement {
    return this.canvas;
  }

  attach(container: HTMLElement): void {
    container.appendChild(this.canvas);
    this.resize();

    // Auto-resize observer
    const resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    resizeObserver.observe(container);
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (parent) {
      const width = parent.clientWidth;
      const height = parent.clientHeight;

      this.renderer.setSize(width, height, false);

      // Note: Camera aspect ratio update is responsibility of the SceneRunner or Camera system
    }
  }

  render(scene: Scene, camera: Camera): void {
    this.renderer.render(scene, camera);
  }

  setAutoClear(autoClear: boolean): void {
    this.renderer.autoClear = autoClear;
  }

  clear(): void {
    this.renderer.clear();
  }

  clearDepth(): void {
    this.renderer.clearDepth();
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}
