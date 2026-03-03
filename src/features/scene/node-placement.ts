import type { NodeBase } from '@pix3/runtime';
import type { SceneGraph } from '@pix3/runtime';
import { Node2D } from '@pix3/runtime';
import { Node3D } from '@pix3/runtime';

const isCompatible2DContainer = (node: NodeBase | null): node is NodeBase => {
  return Boolean(node && node instanceof Node2D && node.isContainer);
};

export const resolve2DParentForCreation = (
  sceneGraph: SceneGraph,
  parentNodeId: string | null,
  selectedNodeId: string | null
): NodeBase | null => {
  const explicitParent = parentNodeId ? (sceneGraph.nodeMap.get(parentNodeId) ?? null) : null;
  if (isCompatible2DContainer(explicitParent)) {
    return explicitParent;
  }

  const selectedParent = selectedNodeId ? (sceneGraph.nodeMap.get(selectedNodeId) ?? null) : null;
  if (isCompatible2DContainer(selectedParent)) {
    return selectedParent;
  }

  return null;
};

export const resolveDefault3DParent = (sceneGraph: SceneGraph): NodeBase | null => {
  return sceneGraph.rootNodes.find(node => node instanceof Node3D) ?? null;
};

export const attachNode = (
  sceneGraph: SceneGraph,
  node: NodeBase,
  parentNode: NodeBase | null
): void => {
  if (parentNode) {
    parentNode.adoptChild(node);
  } else {
    sceneGraph.rootNodes.push(node);
  }
  sceneGraph.nodeMap.set(node.nodeId, node);
};

export const detachNode = (
  sceneGraph: SceneGraph,
  node: NodeBase,
  parentNode: NodeBase | null
): void => {
  if (parentNode) {
    parentNode.disownChild(node);
  } else {
    sceneGraph.rootNodes = sceneGraph.rootNodes.filter(rootNode => rootNode.nodeId !== node.nodeId);
  }
  sceneGraph.nodeMap.delete(node.nodeId);
};
