import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

import { injectable } from '../../fw/di';
import { NodeBase, type NodeBaseProps } from './nodes/NodeBase';
import { Node3D, type Vector3 } from './nodes/Node3D';
import { Sprite2D, type Vector2 } from './nodes/Sprite2D';
import { sceneJsonSchema } from './schema/SceneSchema';
import type { SceneDiff, SceneDocument, SceneGraph, SceneNodeDefinition } from './types';

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
export class SceneManager {
  private readonly validateScene: ValidateFunction;
  private readonly sceneGraphs = new Map<string, SceneGraph>();
  private activeSceneId: string | null = null;

  constructor() {
    const ajvInstance = new Ajv({
      allErrors: true,
      removeAdditional: false,
    });
    addFormats(ajvInstance);
    this.validateScene = ajvInstance.compile(sceneJsonSchema as Record<string, unknown>);
  }

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

    if (!this.validateScene(document)) {
      const issues = (this.validateScene.errors ?? []).map((err: ErrorObject) => {
        const pointer = err.instancePath || err.schemaPath || '/';
        return `${pointer} ${err.message ?? 'is invalid'}`;
      });
      throw new SceneValidationError(
        `Scene document failed validation${options.filePath ? ` (${options.filePath})` : ''}.`,
        issues
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

  computeDiff(previous: SceneGraph | null, next: SceneGraph): SceneDiff {
    const prevIndex = previous?.nodeMap ?? new Map<string, NodeBase>();
    const diff: SceneDiff = { added: [], removed: [], updated: [] };

    for (const [id, nextNode] of next.nodeMap.entries()) {
      const prior = prevIndex.get(id);
      if (!prior) {
        diff.added.push(nextNode);
        continue;
      }
      if (!this.areNodesEqual(prior, nextNode)) {
        diff.updated.push(nextNode);
      }
    }

    for (const [id, priorNode] of prevIndex.entries()) {
      if (!next.nodeMap.has(id)) {
        diff.removed.push(priorNode);
      }
    }

    return diff;
  }

  setActiveSceneGraph(sceneId: string, graph: SceneGraph): void {
    this.sceneGraphs.set(sceneId, graph);
    this.activeSceneId = sceneId;
    // Debug logging to help trace when scenes are registered as active
    if (process.env.NODE_ENV === 'development') {
      console.debug('[SceneManager] setActiveSceneGraph', {
        sceneId,
        rootCount: graph.rootNodes.length,
      });
    }
  }

  getSceneGraph(sceneId: string): SceneGraph | null {
    const graph = this.sceneGraphs.get(sceneId) ?? null;

    return graph;
  }

  getActiveSceneGraph(): SceneGraph | null {
    if (!this.activeSceneId) {
      return null;
    }
    const graph = this.sceneGraphs.get(this.activeSceneId) ?? null;

    return graph;
  }

  removeSceneGraph(sceneId: string): void {
    this.sceneGraphs.delete(sceneId);
    if (this.activeSceneId === sceneId) {
      this.activeSceneId = null;
    }
  }

  dispose(): void {
    this.sceneGraphs.clear();
    this.activeSceneId = null;
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
        const { position, rotation, scale, ...restProps } = baseProps.properties as Record<
          string,
          unknown
        >;
        return new Node3D(
          {
            ...baseProps,
            properties: restProps,
            position: this.asVector3(position, DEFAULT_VECTOR3),
            rotation: this.asVector3(rotation, DEFAULT_VECTOR3),
            scale: this.asVector3(scale, { x: 1, y: 1, z: 1 }),
          },
          parent
        );
      }
      default:
        return new NodeBase({ ...baseProps, type: definition.type }, parent);
    }
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

  private areNodesEqual(a: NodeBase, b: NodeBase): boolean {
    return JSON.stringify(a.toJSON()) === JSON.stringify(b.toJSON());
  }
}
