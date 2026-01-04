import { NodeBase, type NodeBaseProps } from './NodeBase';
import type { PropertySchema } from '@/fw';

export interface SceneNodeProps extends Omit<NodeBaseProps, 'type'> {
  // No additional props for SceneNode
}

/**
 * SceneNode is a specialized container node that acts as the single root of a scene.
 * It can have scripts (Controllers) attached and serves as the entry point for scene-wide logic.
 * All scenes have exactly one SceneNode as the root, which contains 2D and 3D layers.
 */
export class SceneNode extends NodeBase {
  constructor(props: SceneNodeProps) {
    super({ ...props, type: 'Scene' });
    // SceneNode is always a container
    this.isContainer = true;
  }

  /**
   * Get the property schema for SceneNode.
   * Extends NodeBase schema without additional properties.
   */
  static getPropertySchema(): PropertySchema {
    const baseSchema = NodeBase.getPropertySchema();

    return {
      nodeType: 'Scene',
      extends: 'NodeBase',
      properties: [...baseSchema.properties],
      groups: {
        ...baseSchema.groups,
      },
    };
  }
}
