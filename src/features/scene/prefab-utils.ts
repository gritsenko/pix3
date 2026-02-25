import type { NodeBase } from '@pix3/runtime';

export interface PrefabMetadata {
  localId: string;
  effectiveLocalId: string;
  instanceRootId: string;
  sourcePath: string;
  basePropertiesByLocalId?: Record<string, Record<string, unknown>>;
}

const PREFAB_METADATA_KEY = '__pix3Prefab';

export const getPrefabMetadata = (node: NodeBase): PrefabMetadata | null => {
  const metadata = node.metadata as Record<string, unknown>;
  const candidate = metadata[PREFAB_METADATA_KEY];
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const marker = candidate as Partial<PrefabMetadata>;
  if (
    typeof marker.localId !== 'string' ||
    typeof marker.effectiveLocalId !== 'string' ||
    typeof marker.instanceRootId !== 'string' ||
    typeof marker.sourcePath !== 'string'
  ) {
    return null;
  }

  return marker as PrefabMetadata;
};

export const isPrefabNode = (node: NodeBase): boolean => getPrefabMetadata(node) !== null;

export const isPrefabInstanceRoot = (node: NodeBase): boolean => {
  const marker = getPrefabMetadata(node);
  return !!marker && marker.instanceRootId === node.nodeId;
};

export const isPrefabChildNode = (node: NodeBase): boolean => {
  const marker = getPrefabMetadata(node);
  return !!marker && marker.instanceRootId !== node.nodeId;
};

export const findPrefabInstanceRoot = (node: NodeBase): NodeBase | null => {
  const marker = getPrefabMetadata(node);
  if (!marker) {
    return null;
  }

  let current: NodeBase | null = node;
  while (current) {
    if (current.nodeId === marker.instanceRootId) {
      return current;
    }
    current = current.parentNode;
  }

  return null;
};
