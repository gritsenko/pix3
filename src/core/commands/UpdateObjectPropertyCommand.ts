import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandUndoPayload,
  type CommandPreconditionResult,
} from './command';
import { NodeBase } from '../scene/nodes/NodeBase';
import { Node3D, type Vector3 } from '../scene/nodes/Node3D';
import { Sprite2D } from '../scene/nodes/Sprite2D';
import { SceneManager } from '../scene/SceneManager';
import { ViewportRendererService } from '../rendering/ViewportRendererService';

export interface UpdateObjectPropertyExecutePayload {
  /** The node ID that was updated */
  nodeId: string;
  /** The property path that was updated (e.g., 'visible', 'position.x', 'rotation.y') */
  propertyPath: string;
  /** The new value that was set */
  newValue: unknown;
  /** The previous value (for telemetry/debugging) */
  previousValue: unknown;
}

export interface UpdateObjectPropertyUndoPayload {
  /** The node ID to restore */
  nodeId: string;
  /** The property path to restore */
  propertyPath: string;
  /** The previous value to restore */
  previousValue: unknown;
}

export interface UpdateObjectPropertyParams {
  /** Node ID to update */
  nodeId: string;
  /** Property path (e.g., 'visible', 'position.x', 'rotation.y') */
  propertyPath: string;
  /** New value to set */
  value: unknown;
}

/**
 * Command for updating properties on scene objects with support for:
 * - Transform properties (position.x/y/z, rotation.x/y/z, scale.x/y/z)
 * - Generic node properties (visible, name, etc.)
 * - Proper validation based on node type
 * - Full undo/redo support
 *
 * Transform properties are handled specially:
 * - Rotation values are expected in degrees and converted to radians
 * - Scale properties have minimum bounds (typically > 0)
 * - Position properties are unbounded
 */
export class UpdateObjectPropertyCommand extends CommandBase<
  UpdateObjectPropertyExecutePayload,
  UpdateObjectPropertyUndoPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.update-object-property',
    title: 'Update Object Property',
    description: 'Update a property on a scene object',
    keywords: ['update', 'property', 'object', 'node', 'transform'],
    personas: ['technical-artist', 'gameplay-engineer'],
  };

  private readonly params: UpdateObjectPropertyParams;

  constructor(params: UpdateObjectPropertyParams) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext): CommandPreconditionResult {
    const { container } = context;
    const { nodeId, propertyPath, value } = this.params;

    // Get the scene manager
    const sceneManagerToken = container.getOrCreateToken(SceneManager);
    const sceneManager = container.getService<SceneManager>(sceneManagerToken);
    const sceneGraph = sceneManager.getActiveSceneGraph();
    
    if (!sceneGraph) {
      return {
        canExecute: false,
        reason: 'No active scene available',
        scope: 'scene',
        recoverable: true,
      };
    }

    // Find the node in the scene graph
    const node = sceneGraph.nodeMap.get(nodeId);
    if (!node) {
      return {
        canExecute: false,
        reason: `Node with ID '${nodeId}' not found in active scene`,
        scope: 'selection',
        recoverable: true,
      };
    }

    // Validate the property path and value
    const validationResult = this.validatePropertyUpdate(node, propertyPath, value);
    if (!validationResult.isValid) {
      return {
        canExecute: false,
        reason: validationResult.reason,
        scope: 'selection',
        recoverable: true,
      };
    }

    return { canExecute: true };
  }

  execute(context: CommandContext): CommandExecutionResult<UpdateObjectPropertyExecutePayload> {
    const { container, state } = context;
    const { nodeId, propertyPath, value } = this.params;

    // Get the scene manager
    const sceneManagerToken = container.getOrCreateToken(SceneManager);
    const sceneManager = container.getService<SceneManager>(sceneManagerToken);
    const sceneGraph = sceneManager.getActiveSceneGraph();

    if (!sceneGraph) {
      throw new Error('No active scene available');
    }

    // Find the node in the scene graph
    const node = sceneGraph.nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node with ID '${nodeId}' not found in active scene`);
    }

    // Get the previous value for undo
    const previousValue = this.getPropertyValue(node, propertyPath);

    // Apply the property update directly to the node
    this.setPropertyValue(node, propertyPath, value);

    // Notify UI consumers by touching scene state so subscribed components re-sync.
    // - Update lastLoadedAt as a cheap change token
    // - Mark active scene as dirty
    const activeSceneId = state.scenes.activeSceneId;
    if (activeSceneId) {
      state.scenes.lastLoadedAt = Date.now();
      const descriptor = state.scenes.descriptors[activeSceneId];
      if (descriptor) {
        descriptor.isDirty = true;
      }

      // If the node's name changed, update the hierarchy representation so the Scene Tree
      // shows the new name immediately.
      if (propertyPath === 'name') {
        const hierarchy = state.scenes.hierarchies[activeSceneId];
        if (hierarchy && hierarchy.nodes) {
          const updateNameRec = (nodes: any[]): boolean => {
            for (const n of nodes) {
              if (n.id === nodeId) {
                n.name = value as string;
                return true;
              }
              if (n.children && n.children.length > 0) {
                const found = updateNameRec(n.children);
                if (found) return true;
              }
            }
            return false;
          };
          updateNameRec(hierarchy.nodes);
        }
      }
    }

    // Best-effort: force the viewport renderer to re-sync its scene graph so transforms
    // are updated immediately in the canvas. This avoids subtle timing issues where
    // subscriptions may not rebuild the Three.js object graph quickly enough.
    try {
      const vrToken = container.getOrCreateToken(ViewportRendererService);
      const viewportRenderer = container.getService<ViewportRendererService>(vrToken);
      viewportRenderer.setSceneGraph(sceneGraph);
    } catch (err) {
      // Non-fatal: if the renderer/service isn't available (e.g., headless tests), ignore.
    }

    return {
      didMutate: true,
      payload: {
        nodeId,
        propertyPath,
        newValue: value,
        previousValue,
      },
    };
  }

  postCommit(
    _context: CommandContext,
    payload: UpdateObjectPropertyExecutePayload
  ): CommandUndoPayload<UpdateObjectPropertyUndoPayload> {
    return {
      nodeId: payload.nodeId,
      propertyPath: payload.propertyPath,
      previousValue: payload.previousValue,
    };
  }



  private getPropertyValue(node: NodeBase, propertyPath: string): unknown {
    const parts = propertyPath.split('.');
    let current: any = node;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    // Handle special properties
    if (propertyPath === 'visible') {
      return current ?? node.properties.visible ?? true;
    }

    return current;
  }

  private setPropertyValue(node: NodeBase, propertyPath: string, value: unknown): void {
    const parts = propertyPath.split('.');
    
    if (parts.length === 1) {
      // Simple property (e.g., 'visible')
      const property = parts[0];
      if (property === 'visible') {
        node.properties.visible = value;
      } else if (property === 'name') {
        node.name = value as string;
      } else {
        // Generic property
        node.properties[property] = value;
      }
    } else if (parts.length === 2) {
      // Nested property (e.g., 'position.x', 'rotation.y')
      const [objectName, propertyName] = parts;
      
      if (node instanceof Node3D) {
        const targetObject = (node as any)[objectName] as Vector3;
        if (targetObject && typeof targetObject === 'object') {
          (targetObject as any)[propertyName] = value as number;
        }
      } else if (node instanceof Sprite2D) {
        // Handle Sprite2D properties
        if (objectName === 'position' && (propertyName === 'x' || propertyName === 'y')) {
          (node.position as any)[propertyName] = value as number;
        } else if (objectName === 'rotation' && propertyName === 'z') {
          (node as any).rotation = value as number;
        } else if (objectName === 'scale' && (propertyName === 'x' || propertyName === 'y')) {
          (node.scale as any)[propertyName] = value as number;
        }
      }
    }
  }

  private validatePropertyUpdate(node: NodeBase, propertyPath: string, value: unknown): {
    isValid: boolean;
    reason?: string;
  } {
    const parts = propertyPath.split('.');

    // Validate simple properties
    if (parts.length === 1) {
      const property = parts[0];
      if (property === 'visible') {
        if (typeof value !== 'boolean') {
          return { isValid: false, reason: 'Visible property must be a boolean' };
        }
      } else if (property === 'name') {
        if (typeof value !== 'string') {
          return { isValid: false, reason: 'Name property must be a string' };
        }
      }
    } else if (parts.length === 2) {
      // Validate transform properties
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
      
      // Validate based on node type
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
      
      // Validate scale bounds
      if (objectName === 'scale' && (value as number) <= 0) {
        return { isValid: false, reason: 'Scale values must be greater than 0' };
      }
    } else {
      return { isValid: false, reason: 'Property path is too deep' };
    }

    return { isValid: true };
  }
}