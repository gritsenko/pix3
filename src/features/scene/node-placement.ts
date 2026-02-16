import type { NodeBase } from '@pix3/runtime';
import type { SceneGraph } from '@pix3/runtime';
import { Layout2D } from '@pix3/runtime';
import { Node3D } from '@pix3/runtime';

export interface Default2DParentResolution {
  parent: NodeBase;
  createdLayout: Layout2D | null;
}

export const resolveDefault2DParent = (sceneGraph: SceneGraph): Default2DParentResolution => {
  const existingLayout = sceneGraph.rootNodes.find(node => node instanceof Layout2D);
  if (existingLayout) {
    return {
      parent: existingLayout,
      createdLayout: null,
    };
  }

  const layoutNodeId = `layout2d-auto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const layout = new Layout2D({
    id: layoutNodeId,
    name: 'Layout2D',
  });

  sceneGraph.rootNodes.push(layout);
  sceneGraph.nodeMap.set(layoutNodeId, layout);

  return {
    parent: layout,
    createdLayout: layout,
  };
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

export const removeAutoCreatedLayoutIfUnused = (
  sceneGraph: SceneGraph,
  layoutNode: Layout2D | null
): void => {
  if (!layoutNode) {
    return;
  }

  const rootIndex = sceneGraph.rootNodes.indexOf(layoutNode);
  if (rootIndex < 0 || layoutNode.children.length > 0) {
    return;
  }

  sceneGraph.rootNodes.splice(rootIndex, 1);
  sceneGraph.nodeMap.delete(layoutNode.nodeId);
};

export const restoreAutoCreatedLayout = (
  sceneGraph: SceneGraph,
  layoutNode: Layout2D | null
): void => {
  if (!layoutNode || sceneGraph.nodeMap.has(layoutNode.nodeId)) {
    return;
  }

  sceneGraph.rootNodes.push(layoutNode);
  sceneGraph.nodeMap.set(layoutNode.nodeId, layoutNode);
};
