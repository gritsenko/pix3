import { NodeBase } from '@/nodes/NodeBase';
import { Node2D } from '@/nodes/Node2D';
import { Node3D } from '@/nodes/Node3D';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { DirectionalLightNode } from '@/nodes/3D/DirectionalLightNode';
import { GlbModel } from '@/nodes/3D/GlbModel';
import { Mesh3D } from '@/nodes/3D/Mesh3D';

/**
 * Determines the visual representation (color and icon) for a scene node in the UI.
 * This keeps UI concerns separate from the core node data model.
 * @param node The scene node.
 * @returns An object with the color and icon name for the node.
 */
export function getNodeVisuals(node: NodeBase): { color: string; icon: string } {
  if (node instanceof Sprite2D) {
    return { color: '#96cbf6ff', icon: 'image' };
  }
  if (node instanceof Node2D) {
    return { color: '#96cbf6ff', icon: 'square' };
  }
  if (node instanceof DirectionalLightNode) {
    return { color: '#ffeb99', icon: 'sun' };
  }
  if (node instanceof GlbModel) {
    return { color: '#a0e9a0', icon: 'package' };
  }
  if (node instanceof Mesh3D) {
    return { color: '#4e8df5', icon: 'box' };
  }
  if (node instanceof Node3D) {
    return { color: '#fe9ebeff', icon: 'box' };
  }

  // Default for NodeBase or other types
  return { color: '#fff', icon: 'box' };
}
