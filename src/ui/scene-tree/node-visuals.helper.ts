import { NodeBase } from '@pix3/runtime';
import { Node2D } from '@pix3/runtime';
import { Node3D } from '@pix3/runtime';
import { Sprite2D } from '@pix3/runtime';
import { Group2D } from '@pix3/runtime';
import { Layout2D } from '@pix3/runtime';
import { Joystick2D } from '@pix3/runtime';
import { Button2D } from '@pix3/runtime';
import { Label2D } from '@pix3/runtime';
import { Slider2D } from '@pix3/runtime';
import { Bar2D } from '@pix3/runtime';
import { Checkbox2D } from '@pix3/runtime';
import { InventorySlot2D } from '@pix3/runtime';
import { Camera3D } from '@pix3/runtime';
import { DirectionalLightNode } from '@pix3/runtime';
import { MeshInstance } from '@pix3/runtime';
import { GeometryMesh } from '@pix3/runtime';

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
  if (node instanceof Layout2D) {
    return { color: NODE_2D_COLOR, icon: 'viewport' };
  }
  if (node instanceof Sprite2D) {
    return { color: NODE_2D_COLOR, icon: 'image' };
  }
  if (node instanceof Joystick2D) {
    return { color: NODE_2D_COLOR, icon: 'gamepad' };
  }
  if (node instanceof Button2D) {
    return { color: NODE_2D_COLOR, icon: 'ui-button' };
  }
  if (node instanceof Label2D) {
    return { color: NODE_2D_COLOR, icon: 'text' };
  }
  if (node instanceof Slider2D) {
    return { color: NODE_2D_COLOR, icon: 'ui-slider' };
  }
  if (node instanceof Bar2D) {
    return { color: NODE_2D_COLOR, icon: 'ui-bar' };
  }
  if (node instanceof Checkbox2D) {
    return { color: NODE_2D_COLOR, icon: 'ui-checkbox' };
  }
  if (node instanceof InventorySlot2D) {
    return { color: NODE_2D_COLOR, icon: 'ui-inventory-slot' };
  }
  if (node instanceof Group2D) {
    return { color: NODE_2D_COLOR, icon: 'layout' };
  }
  if (node instanceof Node2D) {
    return { color: NODE_2D_COLOR, icon: 'square' };
  }
  if (node instanceof DirectionalLightNode) {
    return { color: NODE_3D_COLOR, icon: 'sun' };
  }
  if (node instanceof MeshInstance) {
    return { color: NODE_3D_COLOR, icon: 'package' };
  }
  if (node instanceof GeometryMesh) {
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
