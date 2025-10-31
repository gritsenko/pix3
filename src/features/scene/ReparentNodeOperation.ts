import type { Operation, OperationContext, OperationInvokeResult, OperationMetadata } from '@/core/Operation';
import { SceneManager } from '@/core/SceneManager';
import { ref } from 'valtio/vanilla';
import type { NodeBase } from '@/nodes/NodeBase';

export interface ReparentNodeOperationParams {
  /** ID of the node to move */
  nodeId: string;
  /** ID of the new parent node (or null for root) */
  newParentId: string | null;
  /** Index within the new parent's children (or -1 to append) */
  newIndex?: number;
}

export class ReparentNodeOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.reparent-node',
    title: 'Reparent Node',
    description: 'Move a node to a new parent or change its order',
    tags: ['scene', 'hierarchy', 'node', 'structure'],
    affectsNodeStructure: true,
  };

  private readonly params: ReparentNodeOperationParams;
  private previousParentId: string | null = null;
  private previousIndex: number = -1;

  constructor(params: ReparentNodeOperationParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, container } = context;
    const activeSceneId = state.scenes.activeSceneId;

    if (!activeSceneId) {
      console.log('[ReparentNodeOperation] No active scene');
      return { didMutate: false };
    }

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      console.log('[ReparentNodeOperation] No scene graph');
      return { didMutate: false };
    }

    // Find the node to move
    const nodeToMove = sceneGraph.nodeMap.get(this.params.nodeId);
    if (!nodeToMove) {
      console.log('[ReparentNodeOperation] Node to move not found:', this.params.nodeId);
      return { didMutate: false };
    }

    // Prevent moving a node to itself or its descendants
    if (this.params.newParentId === this.params.nodeId) {
      console.log('[ReparentNodeOperation] Cannot move node to itself');
      return { didMutate: false };
    }

    // Validate new parent exists if provided and check if it's a descendant
    if (this.params.newParentId) {
      const newParent = sceneGraph.nodeMap.get(this.params.newParentId);
      if (!newParent) {
        console.log('[ReparentNodeOperation] New parent not found:', this.params.newParentId);
        return { didMutate: false };
      }
      
      // Prevent moving a node into its own descendants (circular reference)
      if (this.isDescendantOf(newParent, this.params.nodeId)) {
        console.log('[ReparentNodeOperation] Cannot move to descendant - would create circular reference');
        return { didMutate: false };
      }
    }

    // Store the previous state for undo
    const previousParent = nodeToMove.parentNode;
    if (previousParent) {
      this.previousParentId = previousParent.nodeId;
      this.previousIndex = previousParent.children.indexOf(nodeToMove);
    } else {
      this.previousParentId = null;
      this.previousIndex = sceneGraph.rootNodes.indexOf(nodeToMove);
    }

    // Remove from old parent using Three.js API
    if (nodeToMove.parentNode) {
      nodeToMove.removeFromParent();
    } else {
      const index = sceneGraph.rootNodes.indexOf(nodeToMove);
      if (index !== -1) {
        sceneGraph.rootNodes.splice(index, 1);
      }
    }

    // Add to new parent
    const newIndex = this.params.newIndex ?? -1;
    if (this.params.newParentId) {
      const newParent = sceneGraph.nodeMap.get(this.params.newParentId);
      if (!newParent) {
        return { didMutate: false };
      }
      // Use Three.js API to add child
      newParent.add(nodeToMove);
      
      // If we need to insert at a specific index, reorder after adding
      if (newIndex >= 0 && newIndex < newParent.children.length - 1) {
        newParent.children.splice(newIndex, 0, newParent.children.pop()!);
      }
    } else {
      // Add to root
      if (newIndex >= 0 && newIndex < sceneGraph.rootNodes.length) {
        sceneGraph.rootNodes.splice(newIndex, 0, nodeToMove);
      } else {
        sceneGraph.rootNodes.push(nodeToMove);
      }
    }

    // Update the state hierarchy - REPLACE the entire object to trigger reactivity
    const hierarchy = state.scenes.hierarchies[activeSceneId];
    if (hierarchy) {
      state.scenes.hierarchies[activeSceneId] = {
        version: hierarchy.version,
        description: hierarchy.description,
        rootNodes: ref([...sceneGraph.rootNodes]),
        metadata: hierarchy.metadata,
      };
    }

    // Mark scene as dirty
    const descriptor = state.scenes.descriptors[activeSceneId];
    if (descriptor) {
      descriptor.isDirty = true;
    }

    return {
      didMutate: true,
      commit: {
        label: `Move ${nodeToMove.name} to ${this.params.newParentId ? 'new parent' : 'root'}`,
        undo: () => this.undoReparent(context),
        redo: () => this.redoReparent(context),
      },
    };
  }

  private async undoReparent(context: OperationContext): Promise<void> {
    const { state, container } = context;
    const activeSceneId = state.scenes.activeSceneId;

    if (!activeSceneId) {
      return;
    }

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      return;
    }

    const nodeToMove = sceneGraph.nodeMap.get(this.params.nodeId);
    if (!nodeToMove) {
      return;
    }

    // Remove from current parent using Three.js API
    if (nodeToMove.parentNode) {
      nodeToMove.removeFromParent();
    } else {
      const index = sceneGraph.rootNodes.indexOf(nodeToMove);
      if (index !== -1) {
        sceneGraph.rootNodes.splice(index, 1);
      }
    }

    // Restore to previous parent
    if (this.previousParentId) {
      const previousParent = sceneGraph.nodeMap.get(this.previousParentId);
      if (previousParent) {
        previousParent.add(nodeToMove);
        // Restore to previous index if applicable
        if (this.previousIndex >= 0 && this.previousIndex < previousParent.children.length - 1) {
          previousParent.children.splice(this.previousIndex, 0, previousParent.children.pop()!);
        }
      }
    } else {
      // Restore to root
      if (this.previousIndex >= 0 && this.previousIndex < sceneGraph.rootNodes.length) {
        sceneGraph.rootNodes.splice(this.previousIndex, 0, nodeToMove);
      } else {
        sceneGraph.rootNodes.push(nodeToMove);
      }
    }

    // Update hierarchy state
    const hierarchy = state.scenes.hierarchies[activeSceneId];
    if (hierarchy) {
      state.scenes.hierarchies[activeSceneId] = {
        version: hierarchy.version,
        description: hierarchy.description,
        rootNodes: ref([...sceneGraph.rootNodes]),
        metadata: hierarchy.metadata,
      };
    }
  }

  private async redoReparent(context: OperationContext): Promise<void> {
    // Re-run the perform logic
    await this.perform(context);
  }

  private isDescendantOf(
    node: NodeBase,
    ancestorId: string
  ): boolean {
    let current = node.parentNode;
    while (current) {
      if (current.nodeId === ancestorId) {
        return true;
      }
      current = current.parentNode;
    }
    return false;
  }
}
