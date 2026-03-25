import * as THREE from 'three';
import { BotEntity, BotConfig, BotStateType } from '../core/Types';
import { ModelManager } from './ModelManager';

export class BotRenderer {
  private bot: BotEntity;
  private config: BotConfig;
  private scene: THREE.Scene;
  private debugMode: boolean;
  private colliderMesh: THREE.Mesh | null;
  private targetHighlight: THREE.Mesh | null;
  private lerpFactor: number;
  private previousVisualPosition: THREE.Vector3;
  
  constructor(bot: BotEntity, scene: THREE.Scene, config: BotConfig) {
    this.bot = bot;
    this.config = config;
    this.scene = scene;
    this.debugMode = config.debug.showCollider;
    this.colliderMesh = null;
    this.targetHighlight = null;
    this.lerpFactor = 0.1; // Smooth movement factor
    this.previousVisualPosition = new THREE.Vector3();
    
    this.createVisualRepresentation();
    this.createDebugVisualization();
  }
  
  private createVisualRepresentation(): void {
    // Create group for bot visual representation
    const botGroup = new THREE.Group();
    
    // Get bot model from ModelManager
    const model = ModelManager.getInstance().getBotModel();
    if (model) {
      botGroup.add(model);
      model.rotation.y = Math.PI; // Initial 180 degrees
    } else {
      // Fallback placeholder while loading
      const placeholder = new THREE.Mesh(
        new THREE.SphereGeometry(this.config.navigation.sphereRadius, 16, 16),
        new THREE.MeshStandardMaterial({ 
          color: this.config.visual.color,
          metalness: 0.3,
          roughness: 0.7
        })
      );
      botGroup.add(placeholder);
      
      // Update when models are loaded
      ModelManager.getInstance().onModelsLoaded(() => {
        const loadedModel = ModelManager.getInstance().getBotModel();
        if (loadedModel) {
          botGroup.clear();
          botGroup.add(loadedModel);
          loadedModel.rotation.y = Math.PI; // Initial 180 degrees
          this.enableShadows(loadedModel);
          // Initial color update
          this.updateVisualColor();
        }
      });
    }
    
    // Position the bot at its starting position
    botGroup.position.copy(this.bot.state.position);
    
    // Enable shadows for the entire group
    this.enableShadows(botGroup);
    
    this.previousVisualPosition.copy(this.bot.state.position);
    this.bot.visual = botGroup;
    this.scene.add(botGroup);
  }

  private enableShadows(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { (m as any).fog = false; });
        }
      }
    });
  }
  
  private createDebugVisualization(): void {
    if (!this.debugMode) return;
    
    // Create sphere collider for debug visualization
    const sphereGeometry = new THREE.SphereGeometry(
      this.config.navigation.sphereRadius,
      32,
      32
    );
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    this.colliderMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    this.colliderMesh.userData.isGizmo = true;
    this.colliderMesh.position.copy(this.bot.state.position);
    this.scene.add(this.colliderMesh);
    
    // Create target highlight mesh
    const targetGeometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const targetMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    this.targetHighlight = new THREE.Mesh(targetGeometry, targetMaterial);
    this.targetHighlight.userData.isGizmo = true;
    this.targetHighlight.visible = false;
    this.scene.add(this.targetHighlight);
  }
  
  update(deltaTime: number): void {
    if (!this.bot.visual) return;
    
    // Update visual position with lerping to prevent jittering
    const targetPosition = this.bot.state.position.clone();
    const lerpSpeed = this.lerpFactor * deltaTime * 60; // Normalize for 60 FPS
    
    this.bot.visual.position.lerp(targetPosition, lerpSpeed);
    
    // Update surface orientation
    const normal = this.bot.state.surfaceNormal || new THREE.Vector3(0, 1, 0);
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    this.bot.visual.quaternion.slerp(targetQuaternion, 0.2);

    // Update bot orientation based on movement direction
    const movementDirection = new THREE.Vector3()
      .subVectors(targetPosition, this.previousVisualPosition)
      .normalize();
    
    if (movementDirection.length() > 0.001) {
      // Rotate model to face movement direction (around local Y)
      const model = this.bot.visual.children[0];
      if (model) {
        const invQ = this.bot.visual.quaternion.clone().invert();
        const localMovement = movementDirection.clone().applyQuaternion(invQ);
        const targetRotation = Math.atan2(localMovement.x, localMovement.z) + Math.PI;
        
        // Smoothly interpolate towards target rotation
        const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
        model.quaternion.slerp(targetQuat, 0.1 * deltaTime * 60);
      }
    }
    
    this.previousVisualPosition.copy(targetPosition);
    
    // Update debug visualization
    if (this.debugMode && this.colliderMesh) {
      this.colliderMesh.position.copy(this.bot.state.position);
      this.updateTargetHighlight();
    } else {
      if (this.targetHighlight) this.targetHighlight.visible = false;
      if (this.colliderMesh) this.colliderMesh.visible = false;
    }
    
    // Update visual color based on state
    this.updateVisualColor();
  }
  
  private updateVisualColor(): void {
    if (!this.bot.visual) return;
    
    let targetColor = this.config.visual.color;
    
    switch (this.bot.state.state) {
      case BotStateType.FALLING:
        targetColor = 0xaaaaaa; // Gray when falling
        break;
      case BotStateType.ERROR:
        targetColor = this.config.visual.errorColor;
        break;
      case BotStateType.RECOVERING:
        targetColor = this.config.visual.recoveryColor;
        break;
    }

    // Update all materials in the model
    this.bot.visual.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if ('color' in m) (m as any).color.setHex(targetColor);
          });
        } else if ('color' in child.material) {
          (child.material as any).color.setHex(targetColor);
          
        }
      }
    });
  }
  
  private updateTargetHighlight(): void {
    if (!this.targetHighlight) return;
    
    const target = this.bot.state.target;
    const itemTarget = this.bot.state.itemTarget;
    
    if ((target || itemTarget) && this.config.debug.showTarget) {
      this.targetHighlight.visible = true;
      
      if (itemTarget) {
        this.targetHighlight.position.copy(itemTarget.position);
        this.targetHighlight.scale.setScalar(0.3); // Smaller for items
      } else if (target) {
        this.targetHighlight.position.set(target.x, target.y, target.z);
        this.targetHighlight.scale.setScalar(1.2);
      }
      
      // Pulse the target highlight
      const pulseScale = 1.0 + Math.sin(Date.now() * 0.005) * 0.1;
      this.targetHighlight.scale.multiplyScalar(pulseScale);
    } else {
      this.targetHighlight.visible = false;
    }
  }
  
  public setVisible(visible: boolean): void {
    if (this.bot.visual) {
      this.bot.visual.visible = visible;
    }
    
    if (this.colliderMesh) {
      this.colliderMesh.visible = visible && this.debugMode;
    }
    
    if (this.targetHighlight) {
      this.targetHighlight.visible = visible && this.debugMode && this.config.debug.showTarget && (!!this.bot.state.target || !!this.bot.state.itemTarget);
    }
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    
    const isBotVisible = this.bot.visual ? this.bot.visual.visible : false;
    
    if (this.colliderMesh) {
      this.colliderMesh.visible = enabled && isBotVisible;
    }
    
    if (this.targetHighlight) {
      this.targetHighlight.visible = enabled && isBotVisible && this.config.debug.showTarget;
    }
  }
  
  public dispose(): void {
    // Remove visual representation
    if (this.bot.visual) {
      this.scene.remove(this.bot.visual);
      // We don't dispose geometries/materials here as they are shared/managed by ModelManager
      this.bot.visual = null as any;
    }
    
    // Remove debug visualization
    if (this.colliderMesh) {
      this.scene.remove(this.colliderMesh);
      this.colliderMesh.geometry.dispose();
      (this.colliderMesh.material as THREE.Material).dispose();
      this.colliderMesh = null;
    }
    
    if (this.targetHighlight) {
      this.scene.remove(this.targetHighlight);
      this.targetHighlight.geometry.dispose();
      (this.targetHighlight.material as THREE.Material).dispose();
      this.targetHighlight = null;
    }
  }
  
  public getVisualMesh(): THREE.Object3D | null {
    return this.bot.visual;
  }
  
  public getColliderMesh(): THREE.Mesh | null {
    return this.colliderMesh;
  }
  
  public getTargetHighlight(): THREE.Mesh | null {
    return this.targetHighlight;
  }
}