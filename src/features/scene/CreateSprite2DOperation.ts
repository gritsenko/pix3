import type { Operation, OperationContext, OperationInvokeResult, OperationMetadata } from '@/core/Operation';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { SceneManager } from '@/core/SceneManager';
import { ref } from 'valtio/vanilla';
import { Vector2 } from 'three';

export interface CreateSprite2DOperationParams {
  spriteName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  texturePath?: string | null;
}

export class CreateSprite2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-sprite2d',
    title: 'Create Sprite2D',
    description: 'Create a 2D sprite in the scene',
    tags: ['scene', '2d', 'sprite', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateSprite2DOperationParams;

  constructor(params: CreateSprite2DOperationParams = {}) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, container } = context;
    const activeSceneId = state.scenes.activeSceneId;

    if (!activeSceneId) {
      return { didMutate: false };
    }

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      return { didMutate: false };
    }

    // Generate a unique node ID
    const nodeId = `sprite2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the Sprite2D node
    const spriteName = this.params.spriteName || 'Sprite2D';
    const texturePath = this.params.texturePath ?? null;

    const node = new Sprite2D({
      id: nodeId,
      name: spriteName,
      position: this.params.position,
      texturePath,
    });

    // Add to the scene graph
    sceneGraph.rootNodes.push(node);
    sceneGraph.nodeMap.set(nodeId, node);

    // Update the state hierarchy - REPLACE the entire object to trigger reactivity
    const hierarchy = state.scenes.hierarchies[activeSceneId];
    if (hierarchy) {
      // Create a new hierarchy state object to trigger Valtio subscribers
      state.scenes.hierarchies[activeSceneId] = {
        version: hierarchy.version,
        description: hierarchy.description,
        rootNodes: ref([...sceneGraph.rootNodes]), // Create new array reference
        metadata: hierarchy.metadata,
      };
    }

    // Mark scene as dirty
    const descriptor = state.scenes.descriptors[activeSceneId];
    if (descriptor) {
      descriptor.isDirty = true;
    }

    // Select the newly created node
    state.selection.nodeIds = [nodeId];
    state.selection.primaryNodeId = nodeId;

    return {
      didMutate: true,
      commit: {
        label: `Create ${spriteName}`,
        undo: () => {
          // Remove from scene graph
          sceneGraph.rootNodes = sceneGraph.rootNodes.filter(n => n.nodeId !== nodeId);
          sceneGraph.nodeMap.delete(nodeId);

          // Update state hierarchy
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

          // Clear selection if this node was selected
          if (state.selection.nodeIds.includes(nodeId)) {
            state.selection.nodeIds = [];
            state.selection.primaryNodeId = null;
          }
        },
        redo: () => {
          // Re-add to scene graph
          sceneGraph.rootNodes.push(node);
          sceneGraph.nodeMap.set(nodeId, node);

          // Update state hierarchy
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

          // Select the node
          state.selection.nodeIds = [nodeId];
          state.selection.primaryNodeId = nodeId;
        },
      },
    };
  }
}