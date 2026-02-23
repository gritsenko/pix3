import { parse } from 'yaml';
import { Euler, MathUtils, Vector2, Vector3 } from 'three';

import { NodeBase, type NodeBaseProps } from '../nodes/NodeBase';
import { Node3D } from '../nodes/Node3D';
import { MeshInstance } from '../nodes/3D/MeshInstance';
import { Sprite2D } from '../nodes/2D/Sprite2D';
import { Group2D } from '../nodes/2D/Group2D';
import { Layout2D } from '../nodes/2D/Layout2D';
import { DirectionalLightNode } from '../nodes/3D/DirectionalLightNode';
import { PointLightNode } from '../nodes/3D/PointLightNode';
import { SpotLightNode } from '../nodes/3D/SpotLightNode';
import { Sprite3D } from '../nodes/3D/Sprite3D';
import { Joystick2D } from '../nodes/2D/UI/Joystick2D';
import { Button2D } from '../nodes/2D/UI/Button2D';
import { Slider2D } from '../nodes/2D/UI/Slider2D';
import { Bar2D } from '../nodes/2D/UI/Bar2D';
import { Checkbox2D } from '../nodes/2D/UI/Checkbox2D';
import { InventorySlot2D } from '../nodes/2D/UI/InventorySlot2D';
import { Label2D } from '../nodes/2D/UI/Label2D';
import type { SceneGraph } from './SceneManager';

import { GeometryMesh } from '../nodes/3D/GeometryMesh';

import { Camera3D } from '../nodes/3D/Camera3D';

import { Node2D } from '../nodes/Node2D';
import { AssetLoader } from './AssetLoader';
import { ScriptRegistry } from './ScriptRegistry';

const ZERO_VECTOR3 = new Vector3(0, 0, 0);
const UNIT_VECTOR3 = new Vector3(1, 1, 1);
const ZERO_VECTOR2 = new Vector2(0, 0);
const UNIT_VECTOR2 = new Vector2(1, 1);

export class SceneValidationError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = 'SceneValidationError';
    this.details = details;
  }
}

export interface ComponentDefinition {
  id?: string;
  type: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface SceneNodeDefinition {
  id: string;
  type?: string;
  name?: string;
  instance?: string;
  groups?: string[];
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  children?: SceneNodeDefinition[];
  components?: ComponentDefinition[];
}

export interface SceneDocument {
  version: string;
  description?: string;
  metadata?: Record<string, unknown>;
  root: SceneNodeDefinition[];
}

export interface GeometryMeshProperties {
  geometry?: string;
  size?: [number, number, number];
  material?: { color?: string; roughness?: number; metalness?: number; type?: string };
}

export interface Camera3DProperties {
  projection?: 'perspective' | 'orthographic';
  fov?: number;
  near?: number;
  far?: number;
}

export interface DirectionalLightNodeProperties {
  color?: string;
  intensity?: number;
  castShadow?: boolean;
}

export interface PointLightNodeProperties {
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
  castShadow?: boolean;
}

export interface SpotLightNodeProperties {
  color?: string;
  intensity?: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  castShadow?: boolean;
}

export interface Sprite3DProperties {
  texturePath?: string | null;
  width?: number;
  height?: number;
  color?: string;
  billboard?: boolean;
  billboardRoll?: number;
}

export interface Node2DProperties {
  position?: Vector2 | [number, number];
  scale?: Vector2 | [number, number];
  rotation?: number;
}

export interface Layout2DProperties {
  width?: number;
  height?: number;
  resolutionPreset?: string;
  showViewportOutline?: boolean;
}

export interface Group2DProperties extends Node2DProperties {
  width?: number;
  height?: number;
}

export interface ParseSceneOptions {
  filePath?: string;
}

export class SceneLoader {
  private readonly assetLoader: AssetLoader;
  private readonly scriptRegistry: ScriptRegistry;

  constructor(assetLoader: AssetLoader, scriptRegistry: ScriptRegistry) {
    this.assetLoader = assetLoader;
    this.scriptRegistry = scriptRegistry;
  }

  async parseScene(sceneText: string, options: ParseSceneOptions = {}): Promise<SceneGraph> {
    let document: SceneDocument;

    console.debug('[SceneLoader.parseScene] Starting parse', {
      contentLength: sceneText.length,
      contentPreview: sceneText.substring(0, 100),
      filePath: options.filePath,
    });

    try {
      document = parse(sceneText) as SceneDocument;
    } catch (error) {
      throw new SceneValidationError(
        `Failed to parse scene YAML${options.filePath ? ` (${options.filePath})` : ''}.`,
        [(error as Error).message]
      );
    }

    // Handle null document (empty or invalid YAML)
    if (!document) {
      console.error('[SceneLoader.parseScene] YAML parser returned null', {
        contentLength: sceneText.length,
        contentPreview: sceneText.substring(0, 100),
        filePath: options.filePath,
      });
      throw new SceneValidationError(
        `Scene document is empty or invalid${options.filePath ? ` (${options.filePath})` : ''}.`,
        ['The YAML parser returned null or undefined']
      );
    }

    const nodeIndex = new Map<string, NodeBase>();
    const rootNodes: NodeBase[] = [];

    for (const definition of document.root ?? []) {
      const rootNode = await this.instantiateNode(
        definition,
        null,
        nodeIndex,
        options.filePath ?? 'unknown'
      );
      rootNodes.push(rootNode);
    }

    return {
      version: document.version,
      description: document.description,
      metadata: document.metadata ?? {},
      rootNodes,
      nodeMap: nodeIndex,
    };
  }

  private async instantiateNode(
    definition: SceneNodeDefinition,
    parent: NodeBase | null,
    index: Map<string, NodeBase>,
    sceneIdentifier: string
  ): Promise<NodeBase> {
    if (index.has(definition.id)) {
      throw new SceneValidationError(`Duplicate node id "${definition.id}" detected.`, [
        sceneIdentifier,
      ]);
    }

    const node = await this.createNodeFromDefinition(definition);
    if (Array.isArray(definition.groups)) {
      for (const group of definition.groups) {
        if (typeof group === 'string' && group.trim().length > 0) {
          node.addToGroup(group);
        }
      }
    }
    index.set(node.nodeId, node);

    // Load components
    if (definition.components) {
      for (const componentDef of definition.components) {
        const componentId =
          componentDef.id || `${definition.id}-${componentDef.type}-${Date.now()}`;
        const component = this.scriptRegistry.createComponent(componentDef.type, componentId);

        if (component) {
          component.enabled = componentDef.enabled ?? true;

          const configData = componentDef.config ?? {};
          component.config = { ...configData };

          // Set config values using PropertySchema if available
          const schema = this.scriptRegistry.getComponentPropertySchema(componentDef.type);
          if (schema && configData) {
            for (const prop of schema.properties) {
              if (configData[prop.name] !== undefined) {
                prop.setValue(component, configData[prop.name]);
              }
            }
          }

          node.addComponent(component);
        } else {
          console.warn(
            `[SceneLoader] Failed to create component "${componentDef.type}" for node "${definition.id}"`
          );
        }
      }
    }

    if (parent) {
      parent.adoptChild(node);
    }

    const childDefinitions = definition.children ?? [];
    for (const childDef of childDefinitions) {
      await this.instantiateNode(childDef, node, index, sceneIdentifier);
    }

    return node;
  }

  private async createNodeFromDefinition(definition: SceneNodeDefinition): Promise<NodeBase> {
    const baseProps: NodeBaseProps = {
      id: definition.id,
      name: definition.name,
      properties: { ...(definition.properties ?? {}) },
      metadata: definition.metadata ?? {},
    };

    if (definition.instance) {
      return new NodeBase({
        ...baseProps,
        type: definition.type ?? 'Instance',
        instancePath: definition.instance,
      });
    }

    switch (definition.type) {
      case 'Sprite2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        const texturePath = typeof props.texturePath === 'string' ? props.texturePath : null;

        const sprite = new Sprite2D({
          ...baseProps,
          properties: props,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          texturePath,
          width: this.asNumber(props.width, undefined),
          height: this.asNumber(props.height, undefined),
          color: typeof props.color === 'string' ? props.color : undefined,
        });

        if (texturePath) {
          try {
            const texture = await this.assetLoader.loadTexture(texturePath);
            sprite.setTexture(texture);
          } catch (error) {
            console.warn(`[SceneLoader] Error loading texture for Sprite2D "${sprite.nodeId}":`, error);
          }
        }

        return sprite;
      }
      case 'Group':
        return new NodeBase({ ...baseProps, type: 'Group' });
      case 'Node3D':
      case undefined: {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        return new Node3D({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
        });
      }
      case 'Node2D': {
        const props = baseProps.properties as Node2DProperties;
        return new Node2D({
          ...baseProps,
          position: this.readVector2(props.position, ZERO_VECTOR2),
          scale: this.readVector2(props.scale, UNIT_VECTOR2),
          rotation: props.rotation ?? 0,
        });
      }
      case 'Layout2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new Layout2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          width: this.asNumber(props.width, 1920),
          height: this.asNumber(props.height, 1080),
          resolutionPreset:
            typeof props.resolutionPreset === 'string'
              ? (props.resolutionPreset as any)
              : undefined,
          showViewportOutline:
            typeof props.showViewportOutline === 'boolean' ? props.showViewportOutline : true,
        });
      }
      case 'Group2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        const layout = this.asRecord(props.layout);

        return new Group2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          width: this.asNumber(props.width, 100),
          height: this.asNumber(props.height, 100),
          anchorMin: layout?.anchorMin
            ? this.readVector2(layout.anchorMin, new Vector2(0.5, 0.5))
            : undefined,
          anchorMax: layout?.anchorMax
            ? this.readVector2(layout.anchorMax, new Vector2(0.5, 0.5))
            : undefined,
          offsetMin: layout?.offsetMin
            ? this.readVector2(layout.offsetMin, ZERO_VECTOR2)
            : undefined,
          offsetMax: layout?.offsetMax
            ? this.readVector2(layout.offsetMax, ZERO_VECTOR2)
            : undefined,
        });
      }
      case 'Joystick2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new Joystick2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          radius: this.asNumber(props.radius, undefined),
          handleRadius: this.asNumber(props.handleRadius, undefined),
          axisHorizontal: this.asString(props.axisHorizontal),
          axisVertical: this.asString(props.axisVertical),
          baseColor: this.asString(props.baseColor),
          handleColor: this.asString(props.handleColor),
          floating: typeof props.floating === 'boolean' ? props.floating : undefined,
        });
      }
      case 'Button2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new Button2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          width: this.asNumber(props.width, undefined),
          height: this.asNumber(props.height, undefined),
          backgroundColor: this.asString(props.backgroundColor),
          hoverColor: this.asString(props.hoverColor),
          pressedColor: this.asString(props.pressedColor),
          buttonAction: this.asString(props.buttonAction),
          label: this.asString(props.label),
          labelFontFamily: this.asString(props.labelFontFamily),
          labelFontSize: this.asNumber(props.labelFontSize, undefined),
          labelColor: this.asString(props.labelColor),
          labelAlign: this.asString(props.labelAlign) as 'left' | 'center' | 'right' | undefined,
          texturePath: this.asString(props.texturePath),
          enabled: typeof props.enabled === 'boolean' ? props.enabled : undefined,
        });
      }
      case 'Label2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new Label2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          label: this.asString(props.label),
          labelFontFamily: this.asString(props.labelFontFamily),
          labelFontSize: this.asNumber(props.labelFontSize, undefined),
          labelColor: this.asString(props.labelColor),
          labelAlign: this.asString(props.labelAlign) as 'left' | 'center' | 'right' | undefined,
          enabled: typeof props.enabled === 'boolean' ? props.enabled : undefined,
        });
      }
      case 'Slider2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new Slider2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          width: this.asNumber(props.width, undefined),
          height: this.asNumber(props.height, undefined),
          handleSize: this.asNumber(props.handleSize, undefined),
          trackBackgroundColor: this.asString(props.trackBackgroundColor),
          trackFilledColor: this.asString(props.trackFilledColor),
          handleColor: this.asString(props.handleColor),
          minValue: this.asNumber(props.minValue, undefined),
          maxValue: this.asNumber(props.maxValue, undefined),
          value: this.asNumber(props.value, undefined),
          axisName: this.asString(props.axisName),
          label: this.asString(props.label),
          labelFontFamily: this.asString(props.labelFontFamily),
          labelFontSize: this.asNumber(props.labelFontSize, undefined),
          labelColor: this.asString(props.labelColor),
          labelAlign: this.asString(props.labelAlign) as 'left' | 'center' | 'right' | undefined,
          texturePath: this.asString(props.texturePath),
          enabled: typeof props.enabled === 'boolean' ? props.enabled : undefined,
        });
      }
      case 'Bar2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new Bar2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          width: this.asNumber(props.width, undefined),
          height: this.asNumber(props.height, undefined),
          backBackgroundColor: this.asString(props.backBackgroundColor),
          barColor: this.asString(props.barColor),
          minValue: this.asNumber(props.minValue, undefined),
          maxValue: this.asNumber(props.maxValue, undefined),
          value: this.asNumber(props.value, undefined),
          showBorder: typeof props.showBorder === 'boolean' ? props.showBorder : undefined,
          borderColor: this.asString(props.borderColor),
          borderWidth: this.asNumber(props.borderWidth, undefined),
          label: this.asString(props.label),
          labelFontFamily: this.asString(props.labelFontFamily),
          labelFontSize: this.asNumber(props.labelFontSize, undefined),
          labelColor: this.asString(props.labelColor),
          labelAlign: this.asString(props.labelAlign) as 'left' | 'center' | 'right' | undefined,
          texturePath: this.asString(props.texturePath),
          enabled: typeof props.enabled === 'boolean' ? props.enabled : undefined,
        });
      }
      case 'Checkbox2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new Checkbox2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          size: this.asNumber(props.size, undefined),
          checked: typeof props.checked === 'boolean' ? props.checked : undefined,
          uncheckedColor: this.asString(props.uncheckedColor),
          checkedColor: this.asString(props.checkedColor),
          checkmarkColor: this.asString(props.checkmarkColor),
          checkmarkAction: this.asString(props.checkmarkAction),
          label: this.asString(props.label),
          labelFontFamily: this.asString(props.labelFontFamily),
          labelFontSize: this.asNumber(props.labelFontSize, undefined),
          labelColor: this.asString(props.labelColor),
          labelAlign: this.asString(props.labelAlign) as 'left' | 'center' | 'right' | undefined,
          texturePath: this.asString(props.texturePath),
          enabled: typeof props.enabled === 'boolean' ? props.enabled : undefined,
        });
      }
      case 'InventorySlot2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);
        return new InventorySlot2D({
          ...baseProps,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          width: this.asNumber(props.width, undefined),
          height: this.asNumber(props.height, undefined),
          backdropColor: this.asString(props.backdropColor),
          borderColor: this.asString(props.borderColor),
          borderWidth: this.asNumber(props.borderWidth, undefined),
          quantity: this.asNumber(props.quantity, undefined),
          showQuantity: typeof props.showQuantity === 'boolean' ? props.showQuantity : undefined,
          quantityFontSize: this.asNumber(props.quantityFontSize, undefined),
          selectionColor: this.asString(props.selectionColor),
          selectedAction: this.asString(props.selectedAction),
          label: this.asString(props.label),
          labelFontFamily: this.asString(props.labelFontFamily),
          labelFontSize: this.asNumber(props.labelFontSize, undefined),
          labelColor: this.asString(props.labelColor),
          labelAlign: this.asString(props.labelAlign) as 'left' | 'center' | 'right' | undefined,
          texturePath: this.asString(props.texturePath),
          enabled: typeof props.enabled === 'boolean' ? props.enabled : undefined,
        });
      }
      case 'GeometryMesh': {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        const propsRec = baseProps.properties as Record<string, unknown>;
        const geometry = this.asString(propsRec.geometry) ?? 'box';
        const size = this.readVector3(propsRec.size, UNIT_VECTOR3);
        const material = this.asRecord(propsRec.material);
        const materialColor = this.asString(material?.color) ?? '#4e8df5';
        return new GeometryMesh({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          geometry,
          size: [size.x, size.y, size.z],
          material: { color: materialColor },
        });
      }
      case 'DirectionalLightNode': {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        const props = baseProps.properties as DirectionalLightNodeProperties;
        return new DirectionalLightNode({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          color: props.color ?? '#ffffff',
          intensity: props.intensity ?? 1,
          castShadow: typeof props.castShadow === 'boolean' ? props.castShadow : true,
        });
      }
      case 'PointLightNode': {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        const props = baseProps.properties as PointLightNodeProperties;
        return new PointLightNode({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          color: props.color ?? '#ffffff',
          intensity: props.intensity ?? 1,
          distance: props.distance ?? 0,
          decay: props.decay ?? 2,
          castShadow: typeof props.castShadow === 'boolean' ? props.castShadow : true,
        });
      }
      case 'SpotLightNode': {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        const props = baseProps.properties as SpotLightNodeProperties;
        return new SpotLightNode({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          color: props.color ?? '#ffffff',
          intensity: props.intensity ?? 1,
          distance: props.distance ?? 0,
          angle: typeof props.angle === 'number' ? (props.angle * Math.PI) / 180 : Math.PI / 3,
          penumbra: props.penumbra ?? 0,
          decay: props.decay ?? 2,
          castShadow: typeof props.castShadow === 'boolean' ? props.castShadow : true,
        });
      }
      case 'Camera3D': {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        const props = baseProps.properties as Camera3DProperties;
        return new Camera3D({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          projection: props.projection ?? 'perspective',
          fov: props.fov ?? 60,
          near: props.near ?? 0.1,
          far: props.far ?? 1000,
        });
      }
      case 'MeshInstance': {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        const props = baseProps.properties as Record<string, unknown>;
        let src = this.asString(props['src']) ?? null;
        const castShadow = typeof props['castShadow'] === 'boolean' ? props['castShadow'] : true;
        const receiveShadow = typeof props['receiveShadow'] === 'boolean' ? props['receiveShadow'] : true;
        const initialAnimation = this.asString(props['initialAnimation']) ?? null;

        const meshInstance = new MeshInstance({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          src,
          castShadow,
          receiveShadow,
          initialAnimation,
        });

        // Load GLB/GLTF mesh and animations from resource manager
        if (src) {
          try {
            const assetLoaderResult = await this.assetLoader.loadAsset(src);
            const loadedNode = assetLoaderResult.node;

            // Add the loaded geometry to the mesh instance
            if (loadedNode.children && loadedNode.children.length > 0) {
              // Transfer children from loaded node to mesh instance
              for (const child of loadedNode.children) {
                meshInstance.add(child);
              }
            }

            // Transfer animations if available
            if ('animations' in loadedNode && Array.isArray(loadedNode.animations)) {
              meshInstance.animations = loadedNode.animations;
            }

            // Apply shadow properties to loaded children
            meshInstance.applyLoadedShadowProperties();
          } catch (error) {
            console.warn(`[SceneLoader] Error loading GLB model from "${src}":`, error);
          }
        }

        return meshInstance;
      }
      case 'Sprite3D': {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        const props = baseProps.properties as Sprite3DProperties;
        const sprite = new Sprite3D({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          texturePath: this.asString(props.texturePath) ?? null,
          width: this.asNumber(props.width, 1),
          height: this.asNumber(props.height, 1),
          color: this.asString(props.color) ?? '#ffffff',
          billboard: typeof props.billboard === 'boolean' ? props.billboard : false,
          billboardRoll: this.asNumber(props.billboardRoll, 0),
        });

        if (sprite.texturePath) {
          try {
            const texture = await this.assetLoader.loadTexture(sprite.texturePath);
            sprite.setTexture(texture);
          } catch (error) {
            console.warn(
              `[SceneLoader] Error loading texture for Sprite3D "${sprite.nodeId}":`,
              error
            );
          }
        }

        return sprite;
      }
      default:
        return new NodeBase({ ...baseProps, type: definition.type });
    }
  }

  private parseNode3DTransforms(properties: Record<string, unknown>): {
    position: Vector3;
    rotation: Euler;
    rotationOrder: Euler['order'];
    scale: Vector3;
    restProps: Record<string, unknown>;
  } {
    const { position, rotation, scale, transform, ...rest } = properties;

    const fallbackPosition = this.readVector3(position, ZERO_VECTOR3);
    const fallbackRotation = this.readVector3(rotation, ZERO_VECTOR3);
    const fallbackScale = this.readVector3(scale, UNIT_VECTOR3);

    const transformRecord = this.asRecord(transform);

    let resolvedPosition = fallbackPosition;
    let resolvedRotation = fallbackRotation;
    let resolvedScale = fallbackScale;
    let rotationOrder: Euler['order'] = 'XYZ';

    if (transformRecord) {
      rotationOrder = this.readRotationOrder(transformRecord.rotationOrder) ?? rotationOrder;
      resolvedPosition = this.readVector3(
        transformRecord.position ?? transformRecord.translate,
        fallbackPosition
      );
      resolvedRotation = this.readVector3(
        transformRecord.rotationEuler ?? transformRecord.rotation ?? transformRecord.euler,
        fallbackRotation
      );
      resolvedScale = this.readVector3(transformRecord.scale, fallbackScale);

      const remainingTransformEntries = Object.entries(transformRecord).filter(
        ([key]) =>
          ![
            'position',
            'translate',
            'rotation',
            'rotationEuler',
            'euler',
            'scale',
            'rotationOrder',
          ].includes(key)
      );

      if (remainingTransformEntries.length > 0) {
        rest.transform = Object.fromEntries(remainingTransformEntries);
      }
    }

    const rotationEuler = new Euler(
      MathUtils.degToRad(resolvedRotation.x),
      MathUtils.degToRad(resolvedRotation.y),
      MathUtils.degToRad(resolvedRotation.z),
      rotationOrder
    );

    return {
      position: resolvedPosition,
      rotation: rotationEuler,
      rotationOrder,
      scale: resolvedScale,
      restProps: rest,
    };
  }

  private readVector3(value: unknown, fallback: Vector3): Vector3 {
    if (!value) {
      return fallback.clone();
    }

    if (value instanceof Vector3) {
      return value.clone();
    }

    if (Array.isArray(value)) {
      return new Vector3(
        this.asNumber(value[0], fallback.x),
        this.asNumber(value[1], fallback.y),
        this.asNumber(value[2], fallback.z)
      );
    }

    if (typeof value === 'object') {
      const vector = value as Record<string, unknown>;
      return new Vector3(
        this.asNumber(vector.x, fallback.x),
        this.asNumber(vector.y, fallback.y),
        this.asNumber(vector.z, fallback.z)
      );
    }

    return fallback.clone();
  }

  private readVector2(value: unknown, fallback: Vector2): Vector2 {
    if (!value) {
      return fallback.clone();
    }

    if (value instanceof Vector2) {
      return value.clone();
    }

    if (Array.isArray(value)) {
      return new Vector2(this.asNumber(value[0], fallback.x), this.asNumber(value[1], fallback.y));
    }

    if (typeof value === 'object') {
      const vector = value as Record<string, unknown>;
      return new Vector2(this.asNumber(vector.x, fallback.x), this.asNumber(vector.y, fallback.y));
    }

    return fallback.clone();
  }

  private readRotationOrder(value: unknown): Euler['order'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toUpperCase();
    const validOrders: Euler['order'][] = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];
    return validOrders.includes(normalized as Euler['order'])
      ? (normalized as Euler['order'])
      : undefined;
  }

  private asNumber<T>(value: unknown, fallback: T): number | T {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
