import { parse } from 'yaml';

import { injectable } from '../../fw/di';
import { NodeBase, type NodeBaseProps } from './nodes/NodeBase';
import { Node3D, type Vector3 } from './nodes/3D/Node3D';
import { Sprite2D } from './nodes/2D/Sprite2D';
import { type Vector2 } from './nodes/2D/Node2D';
import type { SceneGraph, SceneNodeDefinition, SceneDocument } from './types';

const DEFAULT_VECTOR3: Vector3 = { x: 0, y: 0, z: 0 };
const DEFAULT_VECTOR2: Vector2 = { x: 0, y: 0 };

export class SceneValidationError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = 'SceneValidationError';
    this.details = details;
  }
}

export interface ParseSceneOptions {
  filePath?: string;
}

@injectable()
export class SceneLoader {
  constructor() {}

  parseScene(sceneText: string, options: ParseSceneOptions = {}): SceneGraph {
    let document: SceneDocument;
    try {
      document = parse(sceneText) as SceneDocument;
    } catch (error) {
      throw new SceneValidationError(
        `Failed to parse scene YAML${options.filePath ? ` (${options.filePath})` : ''}.`,
        [(error as Error).message]
      );
    }

    const nodeIndex = new Map<string, NodeBase>();
    const rootNodes = (document.root ?? []).map(definition =>
      this.instantiateNode(definition, null, nodeIndex, options.filePath ?? 'unknown')
    );

    return {
      version: document.version,
      description: document.description,
      metadata: document.metadata ?? {},
      rootNodes,
      nodeMap: nodeIndex,
    };
  }

  private instantiateNode(
    definition: SceneNodeDefinition,
    parent: NodeBase | null,
    index: Map<string, NodeBase>,
    sceneIdentifier: string
  ): NodeBase {
    if (index.has(definition.id)) {
      throw new SceneValidationError(`Duplicate node id "${definition.id}" detected.`, [
        sceneIdentifier,
      ]);
    }

    const node = this.createNodeFromDefinition(definition, parent);
    index.set(node.id, node);

    const childDefinitions = definition.children ?? [];
    for (const childDef of childDefinitions) {
      const child = this.instantiateNode(childDef, node, index, sceneIdentifier);
      node.adoptChild(child);
    }

    return node;
  }

  private createNodeFromDefinition(
    definition: SceneNodeDefinition,
    parent: NodeBase | null
  ): NodeBase {
    const baseProps: NodeBaseProps = {
      id: definition.id,
      name: definition.name,
      properties: { ...(definition.properties ?? {}) },
      metadata: definition.metadata ?? {},
    };

    if (definition.instance) {
      return new NodeBase(
        {
          ...baseProps,
          type: definition.type ?? 'Instance',
          instancePath: definition.instance,
        },
        parent
      );
    }

    switch (definition.type) {
      case 'Sprite2D': {
        const { position, scale, rotation, texturePath, ...rest } = baseProps.properties as Record<
          string,
          unknown
        >;
        return new Sprite2D(
          {
            ...baseProps,
            properties: rest,
            position: this.asVector2(position, DEFAULT_VECTOR2),
            scale: this.asVector2(scale, { x: 1, y: 1 }),
            rotation: typeof rotation === 'number' ? rotation : 0,
            texturePath: typeof texturePath === 'string' ? texturePath : null,
          },
          parent
        );
      }
      case 'Group':
        return new NodeBase({ ...baseProps, type: 'Group' }, parent);
      case 'Node3D':
      case undefined: {
        const parsed = this.parseNode3DTransforms(baseProps.properties as Record<string, unknown>);
        return new Node3D(
          {
            ...baseProps,
            properties: parsed.restProps,
            position: parsed.position,
            rotation: parsed.rotation,
            scale: parsed.scale,
          },
          parent
        );
      }
      default:
        return new NodeBase({ ...baseProps, type: definition.type }, parent);
    }
  }

  private parseNode3DTransforms(properties: Record<string, unknown>): {
    position: Vector3;
    rotation: Vector3;
    scale: Vector3;
    restProps: Record<string, unknown>;
  } {
    const { position, rotation, scale, transform, ...rest } = properties;

    const fallbackPosition = this.asVector3(position, DEFAULT_VECTOR3);
    const fallbackRotation = this.asVector3(rotation, DEFAULT_VECTOR3);
    const fallbackScale = this.asVector3(scale, { x: 1, y: 1, z: 1 });

    const transformRecord = this.asRecord(transform);

    const fallbackPositionTuple: [number, number, number] = [
      fallbackPosition.x,
      fallbackPosition.y,
      fallbackPosition.z,
    ];
    const fallbackRotationTuple: [number, number, number] = [
      fallbackRotation.x,
      fallbackRotation.y,
      fallbackRotation.z,
    ];
    const fallbackScaleTuple: [number, number, number] = [
      fallbackScale.x,
      fallbackScale.y,
      fallbackScale.z,
    ];

    const resolvedPositionTuple = transformRecord
      ? this.readVector3(transformRecord.position ?? transformRecord.translate, fallbackPositionTuple)
      : fallbackPositionTuple;

    const resolvedRotationTuple = transformRecord
      ? this.readVector3(
          transformRecord.rotationEuler ??
            transformRecord.rotation ??
            transformRecord.euler,
          fallbackRotationTuple
        )
      : fallbackRotationTuple;

    const resolvedScaleTuple = transformRecord
      ? this.readVector3(transformRecord.scale, fallbackScaleTuple)
      : fallbackScaleTuple;

    const restProps: Record<string, unknown> = { ...rest };
    if (transformRecord) {
      const remainingTransformEntries = Object.entries(transformRecord).filter(
        ([key]) => !['position', 'translate', 'rotation', 'rotationEuler', 'euler', 'scale'].includes(key)
      );

      if (remainingTransformEntries.length > 0) {
        restProps.transform = Object.fromEntries(remainingTransformEntries);
      }
    }

    return {
      position: {
        x: resolvedPositionTuple[0],
        y: resolvedPositionTuple[1],
        z: resolvedPositionTuple[2],
      },
      rotation: {
        x: resolvedRotationTuple[0],
        y: resolvedRotationTuple[1],
        z: resolvedRotationTuple[2],
      },
      scale: {
        x: resolvedScaleTuple[0],
        y: resolvedScaleTuple[1],
        z: resolvedScaleTuple[2],
      },
      restProps,
    };
  }

  private asVector3(value: unknown, fallback: Vector3): Vector3 {
    if (!value || typeof value !== 'object') {
      return { ...fallback };
    }
    const vector = value as Record<string, unknown>;
    return {
      x: this.asNumber(vector.x, fallback.x),
      y: this.asNumber(vector.y, fallback.y),
      z: this.asNumber(vector.z, fallback.z),
    };
  }

  private readVector3(
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
      const vector = value as Record<string, unknown>;
      return [
        this.asNumber(vector.x, fallback[0]),
        this.asNumber(vector.y, fallback[1]),
        this.asNumber(vector.z, fallback[2]),
      ];
    }

    return [...fallback];
  }

  private asVector2(value: unknown, fallback: Vector2): Vector2 {
    if (!value || typeof value !== 'object') {
      return { ...fallback };
    }
    const vector = value as Record<string, unknown>;
    return {
      x: this.asNumber(vector.x, fallback.x),
      y: this.asNumber(vector.y, fallback.y),
    };
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
}