import * as THREE from 'three';
import { CameraController } from './CameraController';
import { RENDERER, LIGHTING, BLOCK_RENDERING } from '../config';
import { TEXTURES } from '../../assets/textures';
import { assetDiagnostics } from '../utils/AssetDiagnostics';

export interface RendererOptions {
  /** When provided, Renderer runs in "embedded" mode: no WebGLRenderer, no canvas, no render loop.
   *  All game objects are added as children of this Object3D (e.g. a pix3 Node3D). */
  externalParent?: THREE.Object3D;
  /** Whether the host renderer has shadows enabled in embedded mode. */
  shadowsEnabled?: boolean;
}

export class Renderer {
  public renderer!: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public uiScene: THREE.Scene;
  public uiCamera: THREE.OrthographicCamera;
  public cameraController: CameraController;

  /** True when running inside an external engine (e.g. pix3) */
  public readonly embedded: boolean;
  private readonly embeddedShadowsEnabled: boolean;

  private canvas!: HTMLCanvasElement;
  private clock!: THREE.Clock;
  private animationId: number = 0;
  private updateCallback: ((delta: number) => void) | null = null;

  // Performance metrics
  private fps: number = 0;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private lastRenderTimeMs: number = 0;

  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private currentEnvMapIntensity: number = 0;
  private currentHemiGroundColor: THREE.Color = new THREE.Color(0x554433);
  private currentFogColor: THREE.Color = new THREE.Color(0x141322);
  private currentFogDensity: number = 0.04;

  // Cached objects for raycast to avoid per-call allocations
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _mouseVec = new THREE.Vector2();

  constructor(options?: RendererOptions) {
    this.embedded = !!options?.externalParent;
    this.embeddedShadowsEnabled = options?.shadowsEnabled ?? true;

    if (this.embedded) {
      // --- Embedded mode: use external parent as scene root ---
      const parent = options!.externalParent!;

      // Use a virtual Scene wrapper backed by the external parent
      this.scene = new THREE.Scene();
      // Redirect: anything added to this.scene will also be added to the external parent
      const origAdd = this.scene.add.bind(this.scene);
      this.scene.add = (...objects: THREE.Object3D[]) => {
        origAdd(...objects);
        for (const obj of objects) parent.add(obj);
        return this.scene;
      };

      // UI scene still useful for 2D overlays within game logic
      this.uiScene = new THREE.Scene();
      this.uiScene.background = null;

      const width = window.innerWidth;
      const height = window.innerHeight;
      this.uiCamera = new THREE.OrthographicCamera(
        -width / 2, width / 2, height / 2, -height / 2, 0.1, 1000
      );
      this.uiCamera.position.z = 10;

      const aspect = width / height;
      this.cameraController = new CameraController(aspect);
      // Add camera pivot to external parent so it's part of the scene
      parent.add(this.cameraController.pivotObject);

      this.setupLighting();

      // Fog on the real scene containing the parent (if it's a Scene)
      let rootScene = parent as THREE.Object3D;
      while (rootScene.parent) rootScene = rootScene.parent;
      if (rootScene instanceof THREE.Scene) {
        rootScene.fog = new THREE.FogExp2(LIGHTING.backgroundColor, LIGHTING.fogDensity);
      }

      this.currentEnvMapIntensity = BLOCK_RENDERING.envMapIntensity;
      this.currentHemiGroundColor.setHex(LIGHTING.hemispheric.groundColor);
      this.currentFogColor.setHex(LIGHTING.backgroundColor);
      this.currentFogDensity = LIGHTING.fogDensity;

      // No canvas, no WebGLRenderer, no clock, no resize listener in embedded mode
      return;
    }

    // --- Standalone mode (original) ---
    // Get canvas
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error('Canvas element not found');
    }

    // Create renderer with optimized settings for mobile
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: RENDERER.antialias,
      powerPreference: RENDERER.powerPreference as WebGLPowerPreference,
      alpha: RENDERER.alpha,
    });

    // Configure renderer
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER.maxPixelRatio)); // Cap for mobile perf
    // Allow ?noShadows=true URL parameter to disable shadows at startup (useful for low-end iOS devices)
    const noShadowsParam = new URLSearchParams(window.location.search).get('noShadows');
    this.renderer.shadowMap.enabled = RENDERER.shadowMapEnabled && noShadowsParam !== 'true';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDERER.toneMappingExposure;
    this.renderer.autoClear = false; // Manual control for multi-pass rendering

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(LIGHTING.backgroundColor);

    // Load background gradient image
    const textureLoader = new THREE.TextureLoader();
    const bgStartTime = performance.now();
    assetDiagnostics.trackTextureStart('backgroundGradient', TEXTURES.backGradient);
    textureLoader.load(TEXTURES.backGradient, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = texture;
      assetDiagnostics.trackTextureLoaded('backgroundGradient', TEXTURES.backGradient, texture, 0, performance.now() - bgStartTime);
    }, undefined, () => {
      assetDiagnostics.trackTextureFailed('backgroundGradient', TEXTURES.backGradient);
    });

    // Create UI scene and camera
    this.uiScene = new THREE.Scene();
    this.uiScene.background = null;

    const width = window.innerWidth;
    const height = window.innerHeight;
    this.uiCamera = new THREE.OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      1000
    );
    this.uiCamera.position.z = 10;

    // Create camera controller
    const aspect = window.innerWidth / window.innerHeight;
    this.cameraController = new CameraController(aspect);
    this.scene.add(this.cameraController.pivotObject);

    // Setup lighting (static)
    this.setupLighting();

    // Setup fog for depth (fade into darkness)
    this.scene.fog = new THREE.FogExp2(LIGHTING.backgroundColor, LIGHTING.fogDensity);

    // Load equirectangular environment map for reflections
    const envLoader = new THREE.TextureLoader();
    envLoader.load(TEXTURES.envMap, (envTexture) => {
      envTexture.mapping = THREE.EquirectangularReflectionMapping;
      envTexture.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.scene.environment = pmrem.fromEquirectangular(envTexture).texture;
      envTexture.dispose();
      pmrem.dispose();
    });

    // Initialize envMapIntensity from config
    this.currentEnvMapIntensity = BLOCK_RENDERING.envMapIntensity;
    this.currentHemiGroundColor.setHex(LIGHTING.hemispheric.groundColor);
    this.currentFogColor.setHex(LIGHTING.backgroundColor);
    this.currentFogDensity = LIGHTING.fogDensity;

    // Clock for delta time
    this.clock = new THREE.Clock();

    // Handle resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private setupLighting(): void {
    // Fill light (atmospheric)
    this.hemiLight = new THREE.HemisphereLight(
      LIGHTING.hemispheric.skyColor,
      LIGHTING.hemispheric.groundColor,
      LIGHTING.hemispheric.intensity
    );
    this.scene.add(this.hemiLight);

    // Main light (sun) with shadows
    this.sunLight = new THREE.DirectionalLight(LIGHTING.sun.color, LIGHTING.sun.intensity);
    this.sunLight.position.set(
      LIGHTING.sun.position.x,
      LIGHTING.sun.position.y,
      LIGHTING.sun.position.z
    );
    this.sunLight.castShadow = this.embedded
      ? this.embeddedShadowsEnabled
      : this.renderer.shadowMap.enabled;
    this.sunLight.shadow.mapSize.set(LIGHTING.sun.shadowMapSize, LIGHTING.sun.shadowMapSize);
    this.sunLight.shadow.bias = LIGHTING.sun.shadowBias;

    if (LIGHTING.sun.shadowRadius !== undefined) {
      this.sunLight.shadow.radius = LIGHTING.sun.shadowRadius;
    }

    this.sunLight.shadow.normalBias = LIGHTING.sun.shadowNormalBias;
    this.sunLight.shadow.camera.near = LIGHTING.sun.shadowCamera.near;
    this.sunLight.shadow.camera.far = LIGHTING.sun.shadowCamera.far;
    this.sunLight.shadow.camera.left = LIGHTING.sun.shadowCamera.left;
    this.sunLight.shadow.camera.right = LIGHTING.sun.shadowCamera.right;
    this.sunLight.shadow.camera.top = LIGHTING.sun.shadowCamera.top;
    this.sunLight.shadow.camera.bottom = LIGHTING.sun.shadowCamera.bottom;
    (this.sunLight.shadow as THREE.DirectionalLightShadow & { intensity?: number }).intensity = 0.15; // r155+ shadow softness

    // Pin sun light to camera controller's pivot or camera itself
    // User wants "directional light pinned to camera so all sides will be playable good"
    // We add it to the cameraController.pivotObject so it rotates WITH the camera
    this.cameraController.pivotObject.add(this.sunLight);
    this.cameraController.pivotObject.add(this.sunLight.target);
    this.sunLight.target.position.set(0, 0, 0);
  }

  // Set the update callback
  setUpdateCallback(callback: (delta: number) => void): void {
    this.updateCallback = callback;
  }

  // Start render loop
  start(): void {
    if (this.embedded) return; // Render loop owned by pix3 in embedded mode
    if (this.animationId) return;
    this.clock.start();
    this.animate(0);
  }

  // Stop render loop
  stop(): void {
    if (this.embedded) return;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  // Animation loop
  private animate = (time: number): void => {
    this.animationId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    // Calculate FPS every second
    this.frameCount++;
    if (time >= this.lastFpsUpdate + 1000) {
      this.fps = (this.frameCount * 1000) / (time - this.lastFpsUpdate);
      this.lastFpsUpdate = time;
      this.frameCount = 0;
    }

    // Update camera
    this.cameraController.update();

    // Call update callback
    if (this.updateCallback) {
      this.updateCallback(delta);
    }

    this.renderFrame();
  };

  // Render a single frame (extracted for resize/pause support)
  private renderFrame(): void {
    const renderStart = performance.now();

    // Render main scene (clear everything first)
    this.renderer.clear();
    this.renderer.render(this.scene, this.cameraController.camera);

    // Render UI scene on top (only clear depth to preserve color buffer)
    this.renderer.clearDepth();
    this.renderer.render(this.uiScene, this.uiCamera);

    this.lastRenderTimeMs = performance.now() - renderStart;
  }

  // Handle window resize
  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height);
    this.cameraController.resize(width / height);

    // Update UI camera for new window dimensions
    this.uiCamera.left = -width / 2;
    this.uiCamera.right = width / 2;
    this.uiCamera.top = height / 2;
    this.uiCamera.bottom = -height / 2;
    this.uiCamera.updateProjectionMatrix();

    // Force a render even if paused so resize updates are visible immediately
    this.renderFrame();
  }

  // Add object to scene
  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  // Remove object from scene
  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  // Get raycaster for input
  raycast(
    screenX: number,
    screenY: number,
    objects: THREE.Object3D[]
  ): THREE.Intersection[] {
    this._mouseVec.set(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );

    this._raycaster.setFromCamera(this._mouseVec, this.cameraController.camera);
    return this._raycaster.intersectObjects(objects, true);
  }

  // Enable bloom effect for turbo mode
  enableBloom(): void {
    if (this.embedded) return;
    this.renderer.toneMappingExposure = RENDERER.bloomExposure;
  }

  // Disable bloom effect
  disableBloom(): void {
    if (this.embedded) return;
    this.renderer.toneMappingExposure = RENDERER.toneMappingExposure;
  }

  // Get light parameters
  getLightParams() {
    return {
      hemiIntensity: this.hemiLight.intensity,
      hemiSkyColor: this.hemiLight.color.getHex(),
      hemiGroundColor: this.currentHemiGroundColor.getHex(),
      sunIntensity: this.sunLight.intensity,
      sunColor: this.sunLight.color.getHex(),
      exposure: this.embedded ? 1.0 : this.renderer.toneMappingExposure,
      envMapIntensity: this.currentEnvMapIntensity,
      fogColor: this.currentFogColor.getHex(),
      fogDensity: this.currentFogDensity,
    };
  }

  // Set light parameters
  setLightParams(params: {
    hemiIntensity?: number;
    hemiSkyColor?: number;
    hemiGroundColor?: number;
    sunIntensity?: number;
    sunColor?: number;
    exposure?: number;
    envMapIntensity?: number;
    fogColor?: number;
    fogDensity?: number;
  }): void {
    if (params.hemiIntensity !== undefined) this.hemiLight.intensity = params.hemiIntensity;
    if (params.hemiSkyColor !== undefined) this.hemiLight.color.setHex(params.hemiSkyColor);
    if (params.hemiGroundColor !== undefined) {
      this.currentHemiGroundColor.setHex(params.hemiGroundColor);
      this.hemiLight.groundColor.setHex(params.hemiGroundColor);
    }
    if (params.sunIntensity !== undefined) this.sunLight.intensity = params.sunIntensity;
    if (params.sunColor !== undefined) this.sunLight.color.setHex(params.sunColor);
    if (params.exposure !== undefined && !this.embedded) this.renderer.toneMappingExposure = params.exposure;
    if (params.fogColor !== undefined) {
      this.currentFogColor.setHex(params.fogColor);
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.setHex(params.fogColor);
      }
    }
    if (params.fogDensity !== undefined) {
      this.currentFogDensity = params.fogDensity;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.density = params.fogDensity;
      }
    }
    if (params.envMapIntensity !== undefined) {
      // Store the value and update only block materials (tagged with userData.isBlockMaterial)
      this.currentEnvMapIntensity = params.envMapIntensity;
      this.scene.traverse((object: THREE.Object3D) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }

        const material = object.material;
        if (Array.isArray(material)) {
          return;
        }

        if (material.userData?.isBlockMaterial && material.envMapIntensity !== undefined) {
          material.envMapIntensity = params.envMapIntensity;
        }
      });
    }
  }

  // Enable / disable shadow maps at runtime (useful for low-end devices and debug)
  setShadowsEnabled(enabled: boolean): void {
    if (this.embedded) return;
    this.renderer.shadowMap.enabled = enabled;
    this.sunLight.castShadow = enabled;
    this.renderer.shadowMap.needsUpdate = true;
  }

  // Compute triangles by traversing the scene and accounting for instanced meshes
  private computeTriangles(): number {
    let triangles = 0;

    this.scene.traverse((obj) => {
      // Only consider visible mesh-like objects
      if (!obj.visible) return;
      
      const mesh = obj as THREE.Mesh;
      if (!mesh || !mesh.isMesh) return;
      if (mesh.userData.isGizmo) return; // Ignore gizmos
      if (!(mesh.geometry as THREE.BufferGeometry)) return;

      const geometry = mesh.geometry as THREE.BufferGeometry;
      const indexCount = geometry.index ? geometry.index.count : (geometry.attributes.position ? geometry.attributes.position.count : 0);
      const triCount = Math.floor(indexCount / 3);

      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const inst = mesh as THREE.InstancedMesh;
        const instanceCount = Math.max(0, inst.count);
        triangles += triCount * instanceCount;
      } else {
        triangles += triCount;
      }
    });

    return triangles;
  }

  // Count mesh draw calls (visible meshes / instanced meshes with instances)
  private computeMeshDraws(): number {
    let draws = 0;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh || !mesh.isMesh) return;
      if (!mesh.visible) return;

      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const inst = mesh as THREE.InstancedMesh;
        if (inst.count > 0) draws++;
      } else {
        const geometry = mesh.geometry as THREE.BufferGeometry;
        const indexCount = geometry.index ? geometry.index.count : (geometry.attributes.position ? geometry.attributes.position.count : 0);
        if (indexCount > 0) draws++;
      }
    });

    return draws;
  }

  // Get current FPS (cheap)
  public getFPS(): number {
    return this.fps;
  }

  // Get renderer-level metrics
  public getMetrics() {
    const performanceMemory = (window.performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }).memory;

    return {
      fps: this.fps,
      meshes: this.computeMeshDraws(),
      triangles: this.computeTriangles(),
      memory: performanceMemory ? performanceMemory.usedJSHeapSize / 1048576 : 0,
      renderTime: this.embedded ? 0 : this.lastRenderTimeMs,
    };
  }

  // Dispose resources
  dispose(): void {
    this.stop();
    if (!this.embedded) {
      this.renderer.dispose();
      window.removeEventListener('resize', this.onResize.bind(this));
    }
  }
}
