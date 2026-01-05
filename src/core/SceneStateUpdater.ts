import type { AppState } from '@/state';
import type { SceneGraph } from './SceneManager';
import { ref } from 'valtio/vanilla';

export class SceneStateUpdater {
  static updateHierarchyState(state: AppState, sceneId: string, sceneGraph: SceneGraph): void {
    const hierarchy = state.scenes.hierarchies[sceneId];
    if (hierarchy) {
      state.scenes.hierarchies[sceneId] = {
        version: hierarchy.version,
        description: hierarchy.description,
        rootNodes: ref([...sceneGraph.rootNodes]),
        metadata: hierarchy.metadata,
      };
    }
  }

  static markSceneDirty(state: AppState, sceneId: string): void {
    const descriptor = state.scenes.descriptors[sceneId];
    if (descriptor) {
      descriptor.isDirty = true;
    }
  }

  static selectNode(state: AppState, nodeId: string): void {
    state.selection.nodeIds = [nodeId];
    state.selection.primaryNodeId = nodeId;
  }

  static clearSelectionIfTargeted(state: AppState, nodeId: string): void {
    if (state.selection.nodeIds.includes(nodeId)) {
      state.selection.nodeIds = [];
      state.selection.primaryNodeId = null;
    }
  }

  static clearSelection(state: AppState): void {
    state.selection.nodeIds = [];
    state.selection.primaryNodeId = null;
  }
}
