import type { Operation, OperationContext, OperationInvokeResult, OperationMetadata } from '@/core/operations/Operation';
import { SceneManager } from '@/core/scene/SceneManager';
import { ViewportRendererService } from '@/core/rendering/ViewportRendererService';
import { GlbModel } from '@/core/scene/nodes/3D/GlbModel';
import type { NodeBase } from '@/core/scene/nodes/NodeBase';

export interface AddGlbModelParams {
  src: string; // resource URI like res://...
  parentId?: string | null;
  name?: string | null;
}

export class AddGlbModelOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.add-glb-model',
    title: 'Add GLB Model',
    description: 'Creates a GlbModel node and inserts it into the scene graph',
    affectsNodeStructure: true,
    tags: ['create', 'node', 'model', '3d'],
  };

  private readonly params: AddGlbModelParams;

  constructor(params: AddGlbModelParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container, state } = context;
    const sceneManager = container.getService<SceneManager>(container.getOrCreateToken(SceneManager));
    const sceneGraph = sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      return { didMutate: false };
    }

    const resolveId = (): string => {
      const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
      if (g.crypto?.randomUUID) return g.crypto.randomUUID();
      return `node-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    };

    const src = this.params.src;
    const id = resolveId();
    const name = (this.params.name ?? this.deriveNameFromSrc(src)) || 'Model';

    const node = new GlbModel({
      id,
      name,
      properties: { src },
      src,
    });

    // Determine parent
    const preferredParentId = this.params.parentId ?? state.selection.primaryNodeId ?? null;
    const parent: NodeBase | null = preferredParentId ? sceneGraph.nodeMap.get(preferredParentId) ?? null : null;

    if (parent) {
      parent.adoptChild(node);
    } else {
      sceneGraph.rootNodes.push(node);
    }
    sceneGraph.nodeMap.set(node.nodeId, node);

    // mark scene dirty
    const activeSceneId = state.scenes.activeSceneId;
    if (activeSceneId) {
      state.scenes.lastLoadedAt = Date.now();
      const descriptor = state.scenes.descriptors[activeSceneId];
      if (descriptor) descriptor.isDirty = true;
    }

    try {
      const vr = container.getService<ViewportRendererService>(container.getOrCreateToken(ViewportRendererService));
      vr.setSceneGraph(sceneGraph, { preserveCamera: true });
    } catch {}

    return {
      didMutate: true,
      commit: {
        label: 'Add GLB Model',
        beforeSnapshot: context.snapshot,
        undo: async () => {
          // Remove node
          if (parent) {
            parent.disownChild(node);
          } else {
            const idx = sceneGraph.rootNodes.findIndex(n => n.nodeId === node.nodeId);
            if (idx >= 0) sceneGraph.rootNodes.splice(idx, 1);
          }
          sceneGraph.nodeMap.delete(node.nodeId);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          try {
            const vr = container.getService<ViewportRendererService>(container.getOrCreateToken(ViewportRendererService));
            vr.setSceneGraph(sceneGraph, { preserveCamera: true });
          } catch {}
        },
        redo: async () => {
          if (parent) {
            parent.adoptChild(node);
          } else {
            sceneGraph.rootNodes.push(node);
          }
          sceneGraph.nodeMap.set(node.nodeId, node);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          try {
            const vr = container.getService<ViewportRendererService>(container.getOrCreateToken(ViewportRendererService));
            vr.setSceneGraph(sceneGraph, { preserveCamera: true });
          } catch {}
        },
      },
    };
  }

  private deriveNameFromSrc(src: string): string {
    const withoutScheme = src.replace(/^res:\/\//i, '').replace(/^templ:\/\//i, '');
    const base = withoutScheme.split('/').pop() || withoutScheme;
    return (base.replace(/\.[^.]+$/i, '') || 'Model').trim();
  }
}
