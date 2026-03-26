import * as THREE from 'three';
import { ToolType, GameEvents, onGameEvent } from '../core/Types';
import { useGameStore } from '../core/GameStore';
import { type ISystem } from '../core/ISystem';
import { TEXTURES } from '../../assets/textures';
import { assetDiagnostics } from '../utils/AssetDiagnostics';
import { atlasManager } from '../utils/AtlasManager';

interface ToolSlot {
  toolType: ToolType;
  sprite: THREE.Sprite;
  isActive: boolean;
}

export class InventoryUISystem implements ISystem {
  private uiScene: THREE.Scene;
  private uiCamera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private backgroundSprite!: THREE.Sprite;
  private toolSlots: ToolSlot[] = [];
  private textureLoader: THREE.TextureLoader;

  // Panel dimensions and positioning
  private panelWidth: number = 200;
  private panelHeight: number = 150;
  private slotSize: number = 120;
  private selectedScale: number = 0.9;
  private deselectedScale: number = 0.75;
  private pointerInterceptor!: THREE.Sprite;
  
  // Slot positions relative to panel center (adjust to match texture slots)
  private slotOffsets = [
    { x: -80, y: -5 },  // Left slot
    { x: 0, y: -5 },     // Middle slot
    { x: 80, y: -5 },   // Right slot
  ];

  constructor(uiScene: THREE.Scene, uiCamera: THREE.OrthographicCamera, renderer: THREE.WebGLRenderer) {
    this.uiScene = uiScene;
    this.uiCamera = uiCamera;
    this.renderer = renderer;
    this.textureLoader = new THREE.TextureLoader();

    this.createInventoryPanel();
    this.setupEventListeners();
  }

  // Toggle visibility of all inventory elements
  public setVisible(visible: boolean): void {
    if (this.backgroundSprite) this.backgroundSprite.visible = visible;
    if (this.pointerInterceptor) this.pointerInterceptor.visible = visible;
    for (const slot of this.toolSlots) {
        if (slot.sprite) slot.sprite.visible = visible;
    }
  }

  private createInventoryPanel(): void {
    // Load background texture with aspect ratio preservation
    const invStartTime = performance.now();
    assetDiagnostics.trackTextureStart('inventory', TEXTURES.inventory_bg);
    const bgTexture = this.textureLoader.load(
      TEXTURES.inventory_bg,
      (texture) => {
        // Update panel dimensions based on actual texture
        const aspectRatio = texture.image.width / texture.image.height;
        this.panelHeight = 150;
        this.panelWidth = this.panelHeight * aspectRatio;
        this.backgroundSprite.scale.set(this.panelWidth, this.panelHeight, 1);
        this.updateSlotPositions();
        assetDiagnostics.trackTextureLoaded('inventory', TEXTURES.inventory_bg, texture, 0, performance.now() - invStartTime);
      },
      undefined,
      () => {
        assetDiagnostics.trackTextureFailed('inventory', TEXTURES.inventory_bg);
      }
    );
    bgTexture.colorSpace = THREE.SRGBColorSpace;

    // Create background sprite
    const bgMaterial = new THREE.SpriteMaterial({
      map: bgTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      sizeAttenuation: false,
    });

    this.backgroundSprite = new THREE.Sprite(bgMaterial);
    this.backgroundSprite.scale.set(this.panelWidth, this.panelHeight, 1);
    this.backgroundSprite.position.z = 0;
    this.backgroundSprite.renderOrder = 100;
    this.uiScene.add(this.backgroundSprite);

    // Create pointer interceptor to prevent clicks from passing through to blocks below
    const interceptorMaterial = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      sizeAttenuation: false,
    });
    this.pointerInterceptor = new THREE.Sprite(interceptorMaterial);
    this.pointerInterceptor.scale.set(this.panelWidth * 1.2, this.panelHeight * 1.2, 1);
    this.pointerInterceptor.position.z = -1;
    this.pointerInterceptor.renderOrder = 99;
    this.uiScene.add(this.pointerInterceptor);

    // Create tool slots
    const tools: ToolType[] = [ToolType.PICKAXE, ToolType.SHOVEL, ToolType.DRILL];
    const itemTextures = [
      TEXTURES.items.axe,
      TEXTURES.items.shovel,
      TEXTURES.items.jackhammer,
    ];

    tools.forEach((tool, index) => {
      const sprite = this.createToolSlotSprite(tool, itemTextures[index], index);
      this.toolSlots.push({
        toolType: tool,
        sprite,
        isActive: index === 0, // First tool is active by default
      });
      this.uiScene.add(sprite);
    });

    this.updateSlotPositions();
    if (this.toolSlots.length > 0) {
      this.selectTool(this.toolSlots[0].toolType);
    }
  }

  private createToolSlotSprite(toolType: ToolType, texturePath: string, index: number): THREE.Sprite {
    const toolStartTime = performance.now();
    assetDiagnostics.trackTextureStart(`tool_${toolType}`, texturePath);
    
    const texture = atlasManager.getSpriteTexture(texturePath);
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      assetDiagnostics.trackTextureLoaded(`tool_${toolType}`, texturePath, texture, 0, performance.now() - toolStartTime);
    } else {
      assetDiagnostics.trackTextureFailed(`tool_${toolType}`, texturePath);
    }

    const material = new THREE.SpriteMaterial({
      map: texture || new THREE.Texture(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      sizeAttenuation: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.slotSize, this.slotSize, 1);
    sprite.renderOrder = 101;
    sprite.userData = { toolType, index };

    return sprite;
  }

  private updateSlotPositions(): void {
    // Position background at bottom center of screen
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Update camera to match window dimensions
    this.uiCamera.left = -windowWidth / 2;
    this.uiCamera.right = windowWidth / 2;
    this.uiCamera.top = windowHeight / 2;
    this.uiCamera.bottom = -windowHeight / 2;
    this.uiCamera.updateProjectionMatrix();

    // Position background at bottom center
    const panelY = -(windowHeight / 2 - this.panelHeight / 2);
    this.backgroundSprite.position.set(0, panelY, 0);

    // Position pointer interceptor at the same location
    this.pointerInterceptor.position.set(0, panelY, -1);

    // Position tool slots to align with background texture slots
    this.toolSlots.forEach((slot, index) => {
      const offset = this.slotOffsets[index];
      slot.sprite.position.set(offset.x, panelY + offset.y, 1);
    });
  }

  private setupEventListeners(): void {
    // Listen for tool selection events
    onGameEvent(GameEvents.TOOL_CHANGED, (event: any) => {
      this.selectTool(event.tool);
    });

    // Handle window resize
    window.addEventListener('resize', () => this.updateSlotPositions());
  }

  private selectTool(toolType: ToolType): void {
    this.toolSlots.forEach((slot) => {
      if (slot.toolType === toolType) {
        slot.isActive = true;
        slot.sprite.scale.set(
          this.slotSize * this.selectedScale,
          this.slotSize * this.selectedScale,
          1
        );
      } else {
        slot.isActive = false;
        slot.sprite.scale.set(
          this.slotSize * this.deselectedScale,
          this.slotSize * this.deselectedScale,
          1
        );
      }
    });
  }

  update(): void {
    // Inventory UI is static, no dynamic updates needed
  }

  dispose(): void {
    // Clean up textures and materials
    this.toolSlots.forEach((slot) => {
      const material = slot.sprite.material as THREE.SpriteMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
      this.uiScene.remove(slot.sprite);
    });

    const bgMaterial = this.backgroundSprite.material as THREE.SpriteMaterial;
    if (bgMaterial.map) {
      bgMaterial.map.dispose();
    }
    bgMaterial.dispose();
    this.uiScene.remove(this.backgroundSprite);

    const interceptorMaterial = this.pointerInterceptor.material as THREE.SpriteMaterial;
    interceptorMaterial.dispose();
    this.uiScene.remove(this.pointerInterceptor);
  }

  // Handle clicks on tool slots
  handlePointerClick(screenX: number, screenY: number): boolean {
    // Convert screen coordinates to UI camera space
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = screenX - rect.left;
    const y = screenY - rect.top;

    // Raycaster for UI layer
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (x / window.innerWidth) * 2 - 1,
      -(y / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouse, this.uiCamera);

    // Check if click is within the inventory bar area (including interceptor)
    const interceptorIntersects = raycaster.intersectObject(this.pointerInterceptor);
    if (interceptorIntersects.length > 0) {
      // Check if click is on a tool slot
      const toolIntersects = raycaster.intersectObjects(this.toolSlots.map((slot) => slot.sprite));
      if (toolIntersects.length > 0) {
        const clickedSlot = toolIntersects[0].object;
        const toolType = clickedSlot.userData.toolType;
        if (toolType) {
          useGameStore.getState().setCurrentTool(toolType);
          this.selectTool(toolType);
        }
      }
      // Return true to indicate inventory bar intercepted the click
      return true;
    }
    return false;
  }
}
