import { parse } from 'yaml';
import { Euler, MathUtils, Vector2, Vector3 } from 'three';

import { injectable, inject } from '@/fw/di';
import { NodeBase, type NodeBaseProps } from '@/nodes/NodeBase';
import { Node3D } from '@/nodes/Node3D';
import { MeshInstance } from '@/nodes/3D/MeshInstance';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { Group2D } from '@/nodes/2D/Group2D';
import { DirectionalLightNode } from '@/nodes/3D/DirectionalLightNode';
import { PointLightNode } from '@/nodes/3D/PointLightNode';
import { SpotLightNode } from '@/nodes/3D/SpotLightNode';
import type { SceneGraph } from './SceneManager';

import { GeometryMesh } from '@/nodes/3D/GeometryMesh';

import { Camera3D } from '@/nodes/3D/Camera3D';

import { Node2D } from '@/nodes/Node2D';
import { AssetLoader } from './AssetLoader';
import { ScriptRegistry } from '@/services/ScriptRegistry';

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

export interface BehaviorDefinition {
  id: string;
  type: string;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
}

export interface ControllerDefinition {
  type: string;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
}

export interface SceneNodeDefinition {
  id: string;
  type?: string;
  name?: string;
  instance?: string;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  children?: SceneNodeDefinition[];
  behaviors?: BehaviorDefinition[];
  script?: ControllerDefinition;
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
}

export interface PointLightNodeProperties {
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
}

export interface SpotLightNodeProperties {
  color?: string;
  intensity?: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
}

export interface Node2DProperties {
  position?: Vector2 | [number, number];
  scale?: Vector2 | [number, number];
  rotation?: number;
}

export interface Group2DProperties extends Node2DProperties {
  width?: number;
  height?: number;
}

export interface ParseSceneOptions {
  filePath?: string;
}

@injectable()
export class SceneLoader {
  @inject(AssetLoader)
  private readonly assetLoader!: AssetLoader;

  @inject(ScriptRegistry)
  private readonly scriptRegistry!: ScriptRegistry;

  constructor() {}

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
    index.set(node.nodeId, node);

    // Attach behaviors
    if (definition.behaviors) {
      for (const behaviorDef of definition.behaviors) {
        const behavior = this.scriptRegistry.createBehavior(behaviorDef.type, behaviorDef.id);
        if (behavior) {
          behavior.enabled = behaviorDef.enabled ?? true;
          behavior.parameters = { ...(behaviorDef.parameters ?? {}) };

          // Set parameters using PropertySchema if available
          const schema = this.scriptRegistry.getBehaviorPropertySchema(behaviorDef.type);
          if (schema && behaviorDef.parameters) {
            for (const prop of schema.properties) {
              if (behaviorDef.parameters[prop.name] !== undefined) {
                prop.setValue(behavior, behaviorDef.parameters[prop.name]);
              }
            }
          }

          node.behaviors.push(behavior);
        } else {
          console.warn(
            `[SceneLoader] Failed to create behavior "${behaviorDef.type}" for node "${definition.id}"`
          );
        }
      }
    }

    // Attach controller (script)
    if (definition.script) {
      const controller = this.scriptRegistry.createController(
        definition.script.type,
        `${definition.id}-controller`
      );
      if (controller) {
        controller.enabled = definition.script.enabled ?? true;
        controller.parameters = { ...(definition.script.parameters ?? {}) };

        // Set parameters using PropertySchema if available
        const schema = this.scriptRegistry.getControllerPropertySchema(definition.script.type);
        if (schema && definition.script.parameters) {
          for (const prop of schema.properties) {
            if (definition.script.parameters[prop.name] !== undefined) {
              prop.setValue(controller, definition.script.parameters[prop.name]);
            }
          }
        }

        node.controller = controller;
      } else {
        console.warn(
          `[SceneLoader] Failed to create controller "${definition.script.type}" for node "${definition.id}"`
        );
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

        return new Sprite2D({
          ...baseProps,
          properties: props,
          position: this.readVector2(transform?.position ?? props.position, ZERO_VECTOR2),
          scale: this.readVector2(transform?.scale ?? props.scale, UNIT_VECTOR2),
          rotation:
            typeof (transform?.rotation ?? props.rotation) === 'number'
              ? ((transform?.rotation ?? props.rotation) as number)
              : 0,
          texturePath: typeof props.texturePath === 'string' ? props.texturePath : null,
          width: this.asNumber(props.width, 64),
          height: this.asNumber(props.height, 64),
        });
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
      case 'Group2D': {
        const props = baseProps.properties as Record<string, unknown>;
        const transform = this.asRecord(props.transform);

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
        let src = this.asString((baseProps.properties ?? {})['src']) ?? null;

        const meshInstance = new MeshInstance({
          ...baseProps,
          properties: parsed.restProps,
          position: parsed.position,
          rotation: parsed.rotation,
          rotationOrder: parsed.rotationOrder,
          scale: parsed.scale,
          src,
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
          } catch (error) {
            console.warn(`[SceneLoader] Error loading GLB model from "${src}":`, error);
          }
        }

        return meshInstance;
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

  private asNumber(value: unknown, fallback: number): number {
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
