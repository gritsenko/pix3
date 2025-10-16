import { MathUtils, Vector3 } from 'three';
import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { NodeBase } from '@/nodes/NodeBase';
import { Node3D } from '@/nodes/Node3D';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { SceneManager } from '@/core/SceneManager';
import { ViewportRendererService } from '@/services/ViewportRenderService';

export interface UpdateObjectPropertyParams {
  nodeId: string;
  propertyPath: string;
  value: unknown;
}

export class UpdateObjectPropertyOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.update-object-property',
    title: 'Update Object Property',
    description: 'Update a property on a scene object',
    tags: ['property', 'transform'],
  };

  private readonly params: UpdateObjectPropertyParams;

  constructor(params: UpdateObjectPropertyParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container, state } = context;
    const { nodeId, propertyPath, value } = this.params;

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      return { didMutate: false };
    }

    const node = sceneGraph.nodeMap.get(nodeId);
    if (!node) {
      return { didMutate: false };
    }

    const validation = this.validatePropertyUpdate(node, propertyPath, value);
    if (!validation.isValid) {
      return { didMutate: false };
    }

    const previousValue = this.getPropertyValue(node, propertyPath);
    if (previousValue === value) {
      return { didMutate: false };
    }

    this.setPropertyValue(node, propertyPath, value);

    const activeSceneId = state.scenes.activeSceneId;
    if (activeSceneId) {
      state.scenes.lastLoadedAt = Date.now();
      const descriptor = state.scenes.descriptors[activeSceneId];
      if (descriptor) descriptor.isDirty = true;
    }

    try {
      const vr = container.getService<ViewportRendererService>(
        container.getOrCreateToken(ViewportRendererService)
      );
      const isTransform = this.isTransformProperty(propertyPath);
      if (isTransform) {
        vr.updateNodeTransform(node);
      } else {
        // Non-transform property; no need to rebuild, just refresh selection visuals
        vr.updateSelection();
      }
    } catch {}

    return {
      didMutate: true,
      commit: {
        label: 'Update Object Property',
        beforeSnapshot: context.snapshot,
        undo: async () => {
          this.setPropertyValue(node, propertyPath, previousValue);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          try {
            const vr = container.getService<ViewportRendererService>(
              container.getOrCreateToken(ViewportRendererService)
            );
            const isTransform = this.isTransformProperty(propertyPath);
            if (isTransform) {
              vr.updateNodeTransform(node);
            } else {
              vr.updateSelection();
            }
          } catch {}
        },
        redo: async () => {
          this.setPropertyValue(node, propertyPath, value);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          try {
            const vr = container.getService<ViewportRendererService>(
              container.getOrCreateToken(ViewportRendererService)
            );
            const isTransform = this.isTransformProperty(propertyPath);
            if (isTransform) {
              vr.updateNodeTransform(node);
            } else {
              vr.updateSelection();
            }
          } catch {}
        },
      },
    };
  }

  private getPropertyValue(node: NodeBase, propertyPath: string): unknown {
    const parts = propertyPath.split('.');
    let current: unknown = node;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    if (propertyPath === 'visible') {
      return current ?? node.properties.visible ?? true;
    }
    if (parts.length === 2 && parts[0] === 'rotation') {
      const axis = parts[1] as 'x' | 'y' | 'z';
      if (node instanceof Node3D) return MathUtils.radToDeg(node.rotation[axis]);
      if (node instanceof Sprite2D && axis === 'z') return MathUtils.radToDeg(node.rotation.z);
    }
    return current;
  }

  private setPropertyValue(node: NodeBase, propertyPath: string, value: unknown): void {
    const parts = propertyPath.split('.');
    if (parts.length === 1) {
      const property = parts[0];
      if (property === 'visible') {
        const boolValue = Boolean(value);
        node.visible = boolValue;
        node.properties.visible = boolValue;
      } else if (property === 'name') {
        node.name = value as string;
      } else {
        node.properties[property] = value;
      }
      return;
    }
    if (parts.length === 2) {
      const [objectName, propertyName] = parts;
      if (node instanceof Node3D) {
        if (objectName === 'rotation') {
          node.rotation[propertyName as 'x' | 'y' | 'z'] = MathUtils.degToRad(value as number);
        } else if (objectName === 'position' || objectName === 'scale') {
          const vector = node[objectName] as Vector3;
          vector[propertyName as 'x' | 'y' | 'z'] = value as number;
        }
      } else if (node instanceof Sprite2D) {
        const axis = propertyName as 'x' | 'y' | 'z';
        if (objectName === 'position' && (axis === 'x' || axis === 'y')) {
          node.position[axis] = value as number;
        } else if (objectName === 'scale' && (axis === 'x' || axis === 'y')) {
          node.scale[axis] = value as number;
        } else if (objectName === 'rotation' && propertyName === 'z') {
          node.rotation.set(0, 0, MathUtils.degToRad(value as number));
        }
      }
    }
  }

  private validatePropertyUpdate(
    node: NodeBase,
    propertyPath: string,
    value: unknown
  ): { isValid: boolean; reason?: string } {
    const parts = propertyPath.split('.');
    if (parts.length === 1) {
      const property = parts[0];
      if (property === 'visible') {
        if (typeof value !== 'boolean')
          return { isValid: false, reason: 'Visible must be boolean' };
      } else if (property === 'name') {
        if (typeof value !== 'string') return { isValid: false, reason: 'Name must be string' };
      }
    } else if (parts.length === 2) {
      const [objectName, propertyName] = parts;
      if (!['position', 'rotation', 'scale'].includes(objectName)) {
        return { isValid: false, reason: `Unknown transform object: ${objectName}` };
      }
      if (!['x', 'y', 'z'].includes(propertyName)) {
        return { isValid: false, reason: `Invalid property name: ${propertyName}` };
      }
      if (typeof value !== 'number' || !isFinite(value)) {
        return { isValid: false, reason: 'Transform properties must be finite numbers' };
      }
      if (node instanceof Sprite2D) {
        if (objectName === 'position' && propertyName === 'z') {
          return { isValid: false, reason: 'Sprite2D does not support position.z' };
        }
        if (objectName === 'rotation' && (propertyName === 'x' || propertyName === 'y')) {
          return { isValid: false, reason: 'Sprite2D only supports rotation.z' };
        }
        if (objectName === 'scale' && propertyName === 'z') {
          return { isValid: false, reason: 'Sprite2D does not support scale.z' };
        }
      }
      if (objectName === 'scale' && (value as number) <= 0) {
        return { isValid: false, reason: 'Scale values must be greater than 0' };
      }
    } else {
      return { isValid: false, reason: 'Property path is too deep' };
    }
    return { isValid: true };
  }

  private isTransformProperty(propertyPath: string): boolean {
    return (
      propertyPath.startsWith('position.') ||
      propertyPath.startsWith('rotation.') ||
      propertyPath.startsWith('scale.')
    );
  }
}
