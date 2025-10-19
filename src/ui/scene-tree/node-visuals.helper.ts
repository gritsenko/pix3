import { NodeBase } from '@/nodes/NodeBase';
import { Node2D } from '@/nodes/Node2D';
import { Node3D } from '@/nodes/Node3D';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { Camera3D } from '@/nodes/3D/Camera3D';
import { DirectionalLightNode } from '@/nodes/3D/DirectionalLightNode';
import { GlbModel } from '@/nodes/3D/GlbModel';
import { Mesh3D } from '@/nodes/3D/Mesh3D';

// Color constants for node types
const NODE_2D_COLOR = '#96cbf6ff';
const NODE_3D_COLOR = '#fe9ebeff';

/**
 * Determines the visual representation (color and icon) for a scene node in the UI.
 * This keeps UI concerns separate from the core node data model.
 * @param node The scene node.
 * @returns An object with the color and icon name for the node.
 */
export function getNodeVisuals(node: NodeBase): { color: string; icon: string } {
  if (node instanceof Sprite2D) {
    return { color: NODE_2D_COLOR, icon: 'image' };
  }
  if (node instanceof Node2D) {
    return { color: NODE_2D_COLOR, icon: 'square' };
  }
  if (node instanceof DirectionalLightNode) {
    return { color: NODE_3D_COLOR, icon: 'sun' };
  }
  if (node instanceof GlbModel) {
    return { color: NODE_3D_COLOR, icon: 'package' };
  }
  if (node instanceof Mesh3D) {
    return { color: NODE_3D_COLOR, icon: 'box' };
  }
  if (node instanceof Camera3D) {
    return { color: NODE_3D_COLOR, icon: 'camera' };
  }
  if (node instanceof Node3D) {
    return { color: NODE_3D_COLOR, icon: 'box' };
  }

  // Default for NodeBase or other types
  return { color: '#fff', icon: 'box' };
}
