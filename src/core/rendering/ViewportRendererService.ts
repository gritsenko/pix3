import {
  AmbientLight,
  AxesHelper,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MathUtils,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { injectable, ServiceLifetime, inject } from '../../fw/di';
import type { SceneGraph } from '../scene/types';
import type { NodeBase } from '../scene/nodes/NodeBase';
import { Node3D } from '../scene/nodes/Node3D';
import { Sprite2D } from '../scene/nodes/Sprite2D';
import { ViewportSelectionService, type TransformMode } from './ViewportSelectionService';

/**
 * Viewport renderer service for 3D scene rendering.
 *
 * This service is a singleton to ensure the same initialized instance
 * is used across all viewport panels and scene updates. This prevents
 * race conditions where scene graphs might be set on uninitialized instances.
 */
@injectable(ServiceLifetime.Singleton)
export class ViewportRendererService {
  private renderer: WebGLRenderer | null = null;
  private mainScene: Scene | null = null;
  private overlayScene: Scene | null = null;
  private perspectiveCamera: PerspectiveCamera | null = null;
  private overlayCamera: OrthographicCamera | null = null;
  private controls: OrbitControls | null = null;

  @inject(ViewportSelectionService)
  private readonly selectionService!: ViewportSelectionService;
  private animationHandle: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private lastDpr = 1;
  private demoMesh: Mesh | null = null;
  private disposables: Array<{ dispose: () => void }> = [];
  private sceneContentRoot: Group | null = null;
  private activeSceneGraph: SceneGraph | null = null;
  private sceneDisposables: Array<{ dispose: () => void }> = [];
  private readonly reusableTarget = new Vector3();

  initialize(canvas: HTMLCanvasElement): void {
    if (!canvas) {
      throw new Error('[ViewportRenderer] Canvas element is required for initialization.');
    }

    if (this.canvas === canvas && this.renderer) {
      try {
        console.log('[ViewportRenderer] initialize -> already initialized, skipping');
      } catch {
        // ignore
      }
      return;
    }

    this.dispose({ preserveSceneGraph: true });
    this.canvas = canvas;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(new Color('#111317'), 1);
    if (typeof window !== 'undefined') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    this.mainScene = new Scene();
    this.overlayScene = new Scene();

    this.sceneContentRoot = new Group();
    this.sceneContentRoot.name = 'SceneContentRoot';
    this.mainScene.add(this.sceneContentRoot);

    this.perspectiveCamera = new PerspectiveCamera(60, 1, 0.1, 200);
    this.perspectiveCamera.position.set(6, 4, 8);
    this.perspectiveCamera.lookAt(new Vector3(0, 0, 0));

    this.overlayCamera = new OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.overlayCamera.position.set(0, 0, 0);
    this.overlayCamera.lookAt(new Vector3(0, 0, 0));

    this.setupEnvironment();
    this.setupOverlayScene();
    this.setupControls();
    this.setupSelection();

    this.syncSceneContent();
    if (this.sceneContentRoot && this.activeSceneGraph) {
      this.selectionService.updateSelection();
    }
    this.startAnimationLoop();
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.perspectiveCamera || !this.canvas || width <= 0 || height <= 0) {
      return;
    }

    this.applySizeToRenderer(width, height);
  }

  setSceneGraph(sceneGraph: SceneGraph | null): void {
    this.activeSceneGraph = sceneGraph;
    // Emit a small debug report for diagnostics
    this.debugReportSceneGraph(sceneGraph);

    if (this.sceneContentRoot) {
      this.syncSceneContent();
      // Update selection after scene content changes
      this.selectionService.updateSelection();
    } else {
      // Scene graph is stored, will be synced when initialize() calls syncSceneContent()
      if (process.env.NODE_ENV === 'development') {
        console.debug(
          '[ViewportRenderer] Scene graph set before initialization, will sync after init'
        );
      }
    }
  }

  hasActiveSceneGraph(): boolean {
    return !!this.activeSceneGraph;
  }

  // Added for diagnostics — reports when viewport receives scene graphs
  private debugReportSceneGraph(sceneGraph: SceneGraph | null): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[ViewportRenderer] setSceneGraph', {
        hasGraph: !!sceneGraph,
        rootCount: sceneGraph ? sceneGraph.rootNodes.length : 0,
      });
    }
  }

  /**
   * Set the transform mode for the viewport gizmos
   */
  setTransformMode(mode: TransformMode): void {
    this.selectionService.setTransformMode(mode);
  }

  /**
   * Get the current transform mode
   */
  getTransformMode(): TransformMode {
    return this.selectionService.getTransformMode();
  }

  /**
   * Update the selection visualization after external selection changes
   */
  updateSelection(): void {
    this.selectionService.updateSelection();
  }

  /**
   * Apply size to renderer and cameras using precise bounding rect and DPR handling.
   */
  private applySizeToRenderer(width: number, height: number): void {
    if (!this.renderer || !this.perspectiveCamera || !this.canvas) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // Only update pixel ratio if it changed to avoid unnecessary reallocations
    if (dpr !== this.lastDpr) {
      this.renderer.setPixelRatio(dpr);
      this.lastDpr = dpr;
    }

    // Use integer CSS sizes to avoid sub-pixel issues
    const cssW = Math.round(width);
    const cssH = Math.round(height);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    // Drawing buffer size = css size. setSize will multiply by pixelRatio internally
    this.renderer.setSize(cssW, cssH, false);

    // Update perspective camera
    this.perspectiveCamera.aspect = cssW / cssH;
    this.perspectiveCamera.updateProjectionMatrix();

    // Update overlay camera to preserve aspect-correct orthographic projection
    if (this.overlayCamera) {
      const aspect = cssW / cssH;
      const viewHeight = 1;
      this.overlayCamera.left = -aspect * viewHeight;
      this.overlayCamera.right = aspect * viewHeight;
      this.overlayCamera.top = viewHeight;
      this.overlayCamera.bottom = -viewHeight;
      this.overlayCamera.updateProjectionMatrix();
    }
  }

  private syncSceneContent(): void {
    if (!this.sceneContentRoot) {
      return;
    }

    this.clearSceneContent();

    if (!this.activeSceneGraph) {
      this.ensureFallbackContent();
      return;
    }

    for (const rootNode of this.activeSceneGraph.rootNodes) {
      const object = this.buildObjectFromNode(rootNode);
      if (object) {
        this.sceneContentRoot.add(object);
      }
    }
  }

  private clearSceneContent(): void {
    if (!this.sceneContentRoot) {
      this.sceneDisposables = [];
      this.demoMesh = null;
      return;
    }

    while (this.sceneContentRoot.children.length > 0) {
      const child = this.sceneContentRoot.children[0];
      this.sceneContentRoot.remove(child);
    }

    this.sceneDisposables.forEach(resource => {
      try {
        resource.dispose();
      } catch (error) {
        console.warn('[ViewportRenderer] Failed to dispose scene resource', error);
      }
    });
    this.sceneDisposables = [];
    this.demoMesh = null;
  }

  private ensureFallbackContent(): void {
    if (!this.sceneContentRoot) {
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.debug('[ViewportRenderer] No scene graph available, showing fallback content');
    }

    const geometry = new BoxGeometry(1.2, 1.2, 1.2);
    const fallbackColor = new Color('#0000ff').convertSRGBToLinear();
    const material = new MeshStandardMaterial({
      color: fallbackColor,
      roughness: 0.35,
      metalness: 0.25,
    });
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'Fallback Demo Mesh';

    this.sceneContentRoot.add(mesh);
    this.demoMesh = mesh;
    this.registerSceneDisposable(geometry);
    this.registerSceneDisposable(material);
  }

  private registerSceneDisposable(resource: { dispose: () => void }): void {
    this.sceneDisposables.push(resource);
  }

  private buildObjectFromNode(node: NodeBase): Object3D | null {
    const container = new Group();
    container.name = node.name ?? node.id;
    container.userData.nodeId = node.id;

    this.applyTransform(container, node);

    if (node instanceof Node3D) {
      const props = this.asRecord(node.properties) ?? {};
      const kind = (this.asString(props.kind) ?? node.type)?.toLowerCase();
      switch (kind) {
        case 'mesh': {
          const mesh = this.createMeshForNode(node, props);
          if (mesh) {
            container.add(mesh);
          }
          break;
        }
        case 'directionallight': {
          const light = this.createDirectionalLight(props);
          container.add(light);
          break;
        }
        case 'ambientlight': {
          const color = this.parseColor(props.color, '#ffffff');
          const intensity = this.asNumber(props.intensity, 0.35);
          const ambient = new AmbientLight(color, intensity);
          container.add(ambient);
          break;
        }
        case 'camera': {
          this.applyCameraSettings(container, props);
          container.visible = false;
          break;
        }
        default:
          break;
      }
    } else if (node instanceof Sprite2D) {
      const spriteProps = this.asRecord(node.properties) ?? {};
      const plane = this.createSpritePlaceholder(spriteProps, node);
      if (plane) {
        container.add(plane);
      }
    }

    for (const child of node.children) {
      const childObject = this.buildObjectFromNode(child);
      if (childObject) {
        container.add(childObject);
      }
    }

    return container;
  }

  private applyTransform(target: Object3D, node: NodeBase): void {
    const basePosition: [number, number, number] =
      node instanceof Node3D
        ? [node.position.x, node.position.y, node.position.z]
        : node instanceof Sprite2D
          ? [node.position.x, node.position.y, 0]
          : [0, 0, 0];

    const baseRotation: [number, number, number] =
      node instanceof Node3D
        ? [node.rotation.x, node.rotation.y, node.rotation.z]
        : node instanceof Sprite2D
          ? [0, 0, node.rotation]
          : [0, 0, 0];

    const baseScale: [number, number, number] =
      node instanceof Node3D
        ? [node.scale.x, node.scale.y, node.scale.z]
        : node instanceof Sprite2D
          ? [node.scale.x, node.scale.y, 1]
          : [1, 1, 1];

    const props = this.asRecord(node.properties) ?? {};
    const transform = this.asRecord(props.transform);

    const position = this.extractVector3(transform?.position ?? transform?.translate, basePosition);
    target.position.set(position[0], position[1], position[2]);

    const rotationSource = transform?.rotationEuler ?? transform?.rotation ?? transform?.euler;
    const rotation = this.extractVector3(rotationSource, baseRotation);
    target.rotation.set(
      MathUtils.degToRad(rotation[0]),
      MathUtils.degToRad(rotation[1]),
      MathUtils.degToRad(rotation[2])
    );

    const scaleSource = transform && 'scale' in transform ? transform.scale : undefined;
    const scale = this.extractVector3(scaleSource, baseScale);
    target.scale.set(scale[0], scale[1], scale[2]);
  }

  private applyCameraSettings(container: Object3D, props: Record<string, unknown>): void {
    if (!this.perspectiveCamera) {
      return;
    }

    const camera = this.perspectiveCamera;
    camera.position.copy(container.position);
    camera.rotation.copy(container.rotation);

    const fov = props.fov ?? props.fieldOfView;
    if (typeof fov === 'number' && Number.isFinite(fov)) {
      camera.fov = MathUtils.clamp(fov, 10, 120);
    }

    const near = props.near ?? props.nearClip;
    const far = props.far ?? props.farClip;
    if (typeof near === 'number' && Number.isFinite(near)) {
      camera.near = Math.max(0.01, near);
    }
    if (typeof far === 'number' && Number.isFinite(far)) {
      camera.far = Math.max(camera.near + 0.01, far);
    }
    camera.updateProjectionMatrix();

    const target = this.extractVector3(props.target, [0, 0, 0]);
    this.reusableTarget.set(target[0], target[1], target[2]);
    this.controls?.target.copy(this.reusableTarget);
    this.controls?.update();
  }

  private createMeshForNode(node: Node3D, props: Record<string, unknown>): Mesh | null {
    const geometryKind = this.asString(props.geometry) ?? 'box';
    const size = this.extractVector3(props.size, [1, 1, 1]);

    let geometry: BufferGeometry;
    switch (geometryKind.toLowerCase()) {
      case 'box':
      default:
        geometry = new BoxGeometry(size[0], size[1], size[2]);
        break;
    }

    const materialProps = this.asRecord(props.material) ?? {};
    const color = this.parseColor(materialProps.color, '#4e8df5');
    const roughness = this.asNumber(materialProps.roughness, 0.35);
    const metalness = this.asNumber(materialProps.metalness, 0.25);

    const material = new MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });

    this.registerSceneDisposable(geometry);
    this.registerSceneDisposable(material);

    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = node.name;
    return mesh;
  }

  private createDirectionalLight(props: Record<string, unknown>): DirectionalLight {
    const color = this.parseColor(props.color, '#ffffff');
    const intensity = this.asNumber(props.intensity, 1);
    const light = new DirectionalLight(color, intensity);
    light.castShadow = true;
    return light;
  }

  private createSpritePlaceholder(
    props: Record<string, unknown>,
    sprite: Sprite2D
  ): Object3D | null {
    const baseSize: [number, number] = [sprite.scale.x, sprite.scale.y];
    const rawSize = this.extractVector2(props.size, baseSize);
    const size: [number, number] = [
      Math.max(rawSize[0], 0.1) / 100,
      Math.max(rawSize[1], 0.1) / 100,
    ];

    const geometry = new PlaneGeometry(size[0], size[1]);
    const opacity = this.asNumber(props.opacity, 0.85);
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: opacity < 1,
      opacity,
      wireframe: true,
    });

    this.registerSceneDisposable(geometry);
    this.registerSceneDisposable(material);

    const mesh = new Mesh(geometry, material);
    mesh.name = `${sprite.name ?? sprite.id} Sprite`;
    return mesh;
  }

  private extractVector3(
    value: unknown,
    fallback: [number, number, number]
  ): [number, number, number] {
    if (Array.isArray(value)) {
      return [
        this.asNumber(value[0], fallback[0]),
        this.asNumber(value[1], fallback[1]),
        this.asNumber(value[2], fallback[2]),
      ];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return [
        this.asNumber(record.x, fallback[0]),
        this.asNumber(record.y, fallback[1]),
        this.asNumber(record.z, fallback[2]),
      ];
    }

    return [...fallback];
  }

  private extractVector2(value: unknown, fallback: [number, number]): [number, number] {
    if (Array.isArray(value)) {
      return [this.asNumber(value[0], fallback[0]), this.asNumber(value[1], fallback[1])];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return [this.asNumber(record.x, fallback[0]), this.asNumber(record.y, fallback[1])];
    }

    return [...fallback];
  }

  private asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return null;
  }

  private parseColor(value: unknown, fallback: string): Color {
    const colorString = this.asString(value) ?? fallback;
    return new Color(colorString).convertSRGBToLinear();
  }

  dispose(options?: { preserveSceneGraph?: boolean }): void {
    const preserveSceneGraph = options?.preserveSceneGraph ?? false;
    if (this.animationHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationHandle);
    }
    this.animationHandle = null;

    // Dispose selection service
    this.selectionService.dispose();

    this.controls?.dispose();
    this.controls = null;

    this.clearSceneContent();

    this.disposables.forEach(resource => {
      try {
        resource.dispose();
      } catch (error) {
        console.warn('[ViewportRenderer] Failed to dispose resource', error);
      }
    });
    this.disposables = [];

    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
    this.demoMesh = null;

    if (this.sceneContentRoot && this.mainScene) {
      this.mainScene.remove(this.sceneContentRoot);
    }
    this.sceneContentRoot = null;
    if (!preserveSceneGraph) {
      this.activeSceneGraph = null;
    }
    this.sceneDisposables = [];

    this.mainScene = null;
    this.overlayScene = null;
    this.perspectiveCamera = null;
    this.overlayCamera = null;
  }

  private setupControls(): void {
    if (!this.canvas || !this.perspectiveCamera) {
      return;
    }

    this.controls = new OrbitControls(this.perspectiveCamera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 50;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // Handle gizmo drag events to disable/enable orbit controls
    if (this.canvas) {
      this.canvas.addEventListener('viewport:gizmo-drag-start', () => {
        if (this.controls) {
          this.controls.enabled = false;
        }
      });

      this.canvas.addEventListener('viewport:gizmo-drag-end', () => {
        if (this.controls) {
          this.controls.enabled = true;
        }
      });
    }
  }

  private setupSelection(): void {
    if (
      !this.canvas ||
      !this.perspectiveCamera ||
      !this.renderer ||
      !this.mainScene ||
      !this.sceneContentRoot
    ) {
      return;
    }

    this.selectionService.initialize(
      this.canvas,
      this.perspectiveCamera,
      this.renderer,
      this.mainScene,
      this.sceneContentRoot
    );
  }

  private setupEnvironment(): void {
    if (!this.mainScene) {
      return;
    }

    const ambientLight = new AmbientLight(0xffffff, 0.55);
    const directionalLight = new DirectionalLight(0xffffff, 0.85);
    directionalLight.position.set(6, 10, 6);
    directionalLight.castShadow = true;

    this.mainScene.add(ambientLight, directionalLight);

    const axes = new AxesHelper(4);
    this.mainScene.add(axes);

    this.disposables.push(axes.geometry, axes.material as LineBasicMaterial);
  }

  private setupOverlayScene(): void {
    if (!this.overlayScene) {
      return;
    }

    const geometry = new BufferGeometry();
    const positions = new Float32BufferAttribute([-0.9, 0, 0, 0.9, 0, 0, 0, -0.9, 0, 0, 0.9, 0], 3);
    geometry.setAttribute('position', positions);

    const material = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    const crosshair = new LineSegments(geometry, material);

    this.overlayScene.add(crosshair);
    this.disposables.push(geometry, material);
  }

  private startAnimationLoop(): void {
    if (
      !this.renderer ||
      !this.mainScene ||
      !this.overlayScene ||
      !this.perspectiveCamera ||
      !this.overlayCamera
    ) {
      return;
    }

    const renderFrame = () => {
      if (
        !this.renderer ||
        !this.mainScene ||
        !this.overlayScene ||
        !this.perspectiveCamera ||
        !this.overlayCamera
      ) {
        return;
      }

      this.controls?.update();
      if (this.demoMesh) {
        this.demoMesh.rotation.y += 0.01;
        this.demoMesh.rotation.x += 0.005;
      }

      // Check for DPR or layout size changes and adjust renderer size if needed.
      try {
        if (this.canvas && typeof this.canvas.getBoundingClientRect === 'function') {
          const rect = this.canvas.getBoundingClientRect();
          const cssW = Math.round(rect.width);
          const cssH = Math.round(rect.height);
          const currentDpr =
            typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

          // The renderer drawing buffer size equals cssSize * pixelRatio. Compare against
          // the renderer's current drawing buffer size (getDrawingBufferSize) or the size
          // reported by renderer.getSize() multiplied by the current DPR; use integer
          // comparisons to avoid frequent resizes from small subpixel changes.
          const drawingBufferWidth = Math.round(cssW * currentDpr);
          const drawingBufferHeight = Math.round(cssH * currentDpr);

          const size = this.renderer.getSize(new Vector2());
          const bufferWidth = Math.round(size.width);
          const bufferHeight = Math.round(size.height);

          if (
            currentDpr !== this.lastDpr ||
            bufferWidth !== drawingBufferWidth ||
            bufferHeight !== drawingBufferHeight
          ) {
            this.applySizeToRenderer(cssW, cssH);
          }
        }
      } catch {
        // Ignore sizing errors during teardown
      }

      this.renderer!.clear();
      this.renderer!.render(this.mainScene, this.perspectiveCamera);
      this.renderer!.clearDepth();
      this.renderer!.render(this.overlayScene, this.overlayCamera);

      this.animationHandle =
        typeof requestAnimationFrame === 'function' ? requestAnimationFrame(renderFrame) : null;
    };

    this.animationHandle =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(renderFrame) : null;
  }
}

export type ViewportRenderer = ViewportRendererService;
