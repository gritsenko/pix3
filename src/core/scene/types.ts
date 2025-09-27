import type { NodeBase } from './nodes/NodeBase';

export type NodeKind = 'Node3D' | 'Sprite2D' | 'Group' | 'Instance';

export interface SceneNodeDefinition {
  id: string;
  type?: NodeKind;
  name?: string;
  instance?: string;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  children?: SceneNodeDefinition[];
}

export interface SceneDocument {
  version: string;
  description?: string;
  metadata?: Record<string, unknown>;
  root: SceneNodeDefinition[];
}

export interface SceneGraph {
  version: string;
  description?: string;
  rootNodes: NodeBase[];
  nodeMap: Map<string, NodeBase>;
  metadata: Record<string, unknown>;
}

export interface SceneDiff {
  added: NodeBase[];
  removed: NodeBase[];
  updated: NodeBase[];
}
