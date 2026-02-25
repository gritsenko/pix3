import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { AssetLoader, type Layout2D, type NodeBase, SceneManager, Sprite2D } from '@pix3/runtime';
import { Vector2 } from 'three';
import {
  removeAutoCreatedLayoutIfUnused,
  resolveDefault2DParent,
  restoreAutoCreatedLayout,
} from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';
import { ViewportRendererService } from '@/services/ViewportRenderService';

export interface CreateSprite2DOperationParams {
  spriteName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  texturePath?: string | null;
  parentNodeId?: string | null;
  insertIndex?: number;
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

    const nodeId = `sprite2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const spriteName = this.params.spriteName || 'Sprite2D';
    const texturePath = this.params.texturePath ?? null;
    const textureSize = await this.resolveTextureSize(container, texturePath);
    const initialWidth = this.params.width ?? textureSize?.width;
    const initialHeight = this.params.height ?? textureSize?.height;

    const node = new Sprite2D({
      id: nodeId,
      name: spriteName,
      position: this.params.position,
      texturePath,
      width: initialWidth,
      height: initialHeight,
    });

    if (textureSize) {
      node.originalWidth = textureSize.width;
      node.originalHeight = textureSize.height;
      node.textureAspectRatio = textureSize.width / textureSize.height;
    }

    const parentNodeId = this.params.parentNodeId ?? null;
    const parentNode = parentNodeId
      ? ((sceneGraph.nodeMap.get(parentNodeId) as NodeBase | undefined) ?? null)
      : null;
    let autoCreatedLayout: Layout2D | null = null;
    const targetParent =
      parentNode ??
      (() => {
        const result = resolveDefault2DParent(sceneGraph);
        autoCreatedLayout = result.createdLayout;
        return result.parent;
      })();

    const insertIndex = this.resolveInsertIndex(sceneGraph.rootNodes, targetParent, this.params.insertIndex);
    this.insertNode(sceneGraph.rootNodes, node, targetParent, insertIndex);
    sceneGraph.nodeMap.set(node.nodeId, node);
    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);
    this.invalidateViewport(container, node);

    return {
      didMutate: true,
      commit: {
        label: `Create ${spriteName}`,
        undo: () => {
          this.removeNode(sceneGraph.rootNodes, node);
          sceneGraph.nodeMap.delete(node.nodeId);
          removeAutoCreatedLayoutIfUnused(sceneGraph, autoCreatedLayout);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.clearSelectionIfTargeted(state, nodeId);
          this.invalidateViewport(container, node);
        },
        redo: () => {
          this.insertNode(sceneGraph.rootNodes, node, targetParent, insertIndex);
          sceneGraph.nodeMap.set(node.nodeId, node);
          restoreAutoCreatedLayout(sceneGraph, autoCreatedLayout);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.selectNode(state, nodeId);
          this.invalidateViewport(container, node);
        },
      },
    };
  }

  private async resolveTextureSize(
    container: OperationContext['container'],
    texturePath: string | null
  ): Promise<{ width: number; height: number } | null> {
    if (!texturePath || !this.isImageResource(texturePath)) {
      return null;
    }

    try {
      const assetLoader = container.getService<AssetLoader>(container.getOrCreateToken(AssetLoader));
      const texture = await assetLoader.loadTexture(texturePath);
      const image = texture.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | undefined;
      const width = image?.naturalWidth ?? image?.width;
      const height = image?.naturalHeight ?? image?.height;
      texture.dispose();

      if (
        typeof width === 'number' &&
        width > 0 &&
        typeof height === 'number' &&
        height > 0
      ) {
        return { width, height };
      }
    } catch {
      // Keep fallback defaults when loading fails.
    }

    return null;
  }

  private isImageResource(path: string): boolean {
    const normalized = path.toLowerCase().split('?')[0].split('#')[0];
    return /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|avif)$/.test(normalized);
  }

  private resolveInsertIndex(
    rootNodes: NodeBase[],
    parentNode: NodeBase | null,
    requestedIndex: number | undefined
  ): number {
    if (requestedIndex === undefined || requestedIndex < 0) {
      return parentNode ? parentNode.children.length : rootNodes.length;
    }
    return requestedIndex;
  }

  private insertNode(
    rootNodes: NodeBase[],
    node: NodeBase,
    parentNode: NodeBase | null,
    insertIndex: number
  ): void {
    if (parentNode) {
      parentNode.add(node);
      const boundedIndex = Math.max(0, Math.min(insertIndex, parentNode.children.length - 1));
      if (boundedIndex < parentNode.children.length - 1) {
        parentNode.children.splice(boundedIndex, 0, parentNode.children.pop() as NodeBase);
      }
      return;
    }

    if (node.parentNode) {
      node.removeFromParent();
    }

    const boundedIndex = Math.max(0, Math.min(insertIndex, rootNodes.length));
    rootNodes.splice(boundedIndex, 0, node);
  }

  private removeNode(rootNodes: NodeBase[], node: NodeBase): void {
    if (node.parentNode) {
      node.removeFromParent();
      return;
    }
    const index = rootNodes.indexOf(node);
    if (index >= 0) {
      rootNodes.splice(index, 1);
    }
  }

  private invalidateViewport(container: OperationContext['container'], node: Sprite2D): void {
    try {
      const viewport = container.getService<ViewportRendererService>(
        container.getOrCreateToken(ViewportRendererService)
      );
      viewport.updateNodeTransform(node);
      viewport.updateSelection();
      viewport.requestRender();
    } catch {
      // Ignore viewport invalidation failures.
    }
  }
}
