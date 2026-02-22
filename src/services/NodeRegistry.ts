import { CreateGroup2DCommand } from '@/features/scene/CreateGroup2DCommand';
import { CreateSprite2DCommand } from '@/features/scene/CreateSprite2DCommand';
import { CreateBoxCommand } from '@/features/scene/CreateBoxCommand';
import { CreateDirectionalLightCommand } from '@/features/scene/CreateDirectionalLightCommand';
import { CreatePointLightCommand } from '@/features/scene/CreatePointLightCommand';
import { CreateSpotLightCommand } from '@/features/scene/CreateSpotLightCommand';
import { CreateCamera3DCommand } from '@/features/scene/CreateCamera3DCommand';
import { CreateMeshInstanceCommand } from '@/features/scene/CreateMeshInstanceCommand';
import { CreateSprite3DCommand } from '@/features/scene/CreateSprite3DCommand';
import { CreateLayout2DCommand } from '@/features/scene/CreateLayout2DCommand';
import { CreateJoystick2DCommand } from '@/features/scene/CreateJoystick2DCommand';
import { CreateButton2DCommand } from '@/features/scene/CreateButton2DCommand';
import { CreateSlider2DCommand } from '@/features/scene/CreateSlider2DCommand';
import { CreateBar2DCommand } from '@/features/scene/CreateBar2DCommand';
import { CreateCheckbox2DCommand } from '@/features/scene/CreateCheckbox2DCommand';
import { CreateInventorySlot2DCommand } from '@/features/scene/CreateInventorySlot2DCommand';
import { CreateLabel2DCommand } from '@/features/scene/CreateLabel2DCommand';
import type { Command } from '@/core/command';
import { injectable } from '@/fw';

type NodeTypeCommandConstructor = new () => Command<unknown, unknown>;

/**
 * Node type definition for the registry
 */
export interface NodeTypeInfo {
  id: string;
  displayName: string;
  description: string;
  category: '2D' | '3D';
  subcategory?: 'UI';
  commandClass: NodeTypeCommandConstructor;
  color: string;
  icon: string;
  keywords: string[];
  order: number;
}

/**
 * Registry of all available node types organized by category
 */
@injectable()
export class NodeRegistry {
  private nodeTypes: Map<string, NodeTypeInfo> = new Map();

  constructor() {
    this.registerNodeTypes();
  }

  private registerNodeTypes(): void {
    // 2D Node Types
    this.registerNodeType({
      id: 'layout2d',
      displayName: 'Layout2D',
      description: '2D game viewport container',
      category: '2D',
      commandClass: CreateLayout2DCommand,
      color: '#9b59b6ff',
      icon: 'viewport',
      keywords: ['create', 'layout2d', 'viewport', 'container', 'root'],
      order: 0,
    });

    this.registerNodeType({
      id: 'group2d',
      displayName: 'Group2D',
      description: '2D group container for organizing nodes',
      category: '2D',
      commandClass: CreateGroup2DCommand,
      color: '#96cbf6ff',
      icon: 'layout',
      keywords: ['create', 'group', '2d', 'container', 'organize'],
      order: 1,
    });

    this.registerNodeType({
      id: 'sprite2d',
      displayName: 'Sprite2D',
      description: '2D image sprite',
      category: '2D',
      commandClass: CreateSprite2DCommand,
      color: '#96cbf6ff',
      icon: 'image',
      keywords: ['create', 'sprite', '2d', 'image', 'texture'],
      order: 2,
    });
    this.registerNodeType({
      id: 'joystick2d',
      displayName: 'Joystick2D',
      description: '2D virtual joystick for input',
      category: '2D',
      commandClass: CreateJoystick2DCommand,
      color: '#96cbf6ff',
      icon: 'gamepad',
      keywords: ['create', 'joystick', '2d', 'input', 'control'],
      order: 3,
    });
    this.registerNodeType({
      id: 'button2d',
      displayName: 'Button2D',
      description: 'Clickable button control',
      category: '2D',
      subcategory: 'UI',
      commandClass: CreateButton2DCommand,
      color: '#96cbf6ff',
      icon: 'ui-button',
      keywords: ['create', 'button', '2d', 'ui', 'input', 'clickable'],
      order: 4,
    });
    this.registerNodeType({
      id: 'label2d',
      displayName: 'Label2D',
      description: 'Simple text label',
      category: '2D',
      subcategory: 'UI',
      commandClass: CreateLabel2DCommand,
      color: '#96cbf6ff',
      icon: 'text',
      keywords: ['create', 'label', 'text', '2d', 'ui', 'add'],
      order: 4.5,
    });
    this.registerNodeType({
      id: 'slider2d',
      displayName: 'Slider2D',
      description: 'Horizontal slider for value input',
      category: '2D',
      subcategory: 'UI',
      commandClass: CreateSlider2DCommand,
      color: '#96cbf6ff',
      icon: 'ui-slider',
      keywords: ['create', 'slider', '2d', 'ui', 'input', 'range'],
      order: 5,
    });
    this.registerNodeType({
      id: 'bar2d',
      displayName: 'Bar2D',
      description: 'Progress/status bar for HP, energy, etc',
      category: '2D',
      subcategory: 'UI',
      commandClass: CreateBar2DCommand,
      color: '#96cbf6ff',
      icon: 'ui-bar',
      keywords: ['create', 'bar', '2d', 'ui', 'progress', 'hp', 'energy'],
      order: 6,
    });
    this.registerNodeType({
      id: 'checkbox2d',
      displayName: 'Checkbox2D',
      description: 'Toggle checkbox control',
      category: '2D',
      subcategory: 'UI',
      commandClass: CreateCheckbox2DCommand,
      color: '#96cbf6ff',
      icon: 'ui-checkbox',
      keywords: ['create', 'checkbox', '2d', 'ui', 'toggle', 'boolean'],
      order: 7,
    });
    this.registerNodeType({
      id: 'inventoryslot2d',
      displayName: 'InventorySlot2D',
      description: 'Inventory slot for item display and selection',
      category: '2D',
      subcategory: 'UI',
      commandClass: CreateInventorySlot2DCommand,
      color: '#96cbf6ff',
      icon: 'ui-inventory-slot',
      keywords: ['create', 'inventory', 'slot', '2d', 'ui', 'item'],
      order: 8,
    });
    // 3D Node Types
    this.registerNodeType({
      id: 'box',
      displayName: 'Box',
      description: '3D box geometry',
      category: '3D',
      commandClass: CreateBoxCommand,
      color: '#fe9ebeff',
      icon: 'box',
      keywords: ['create', 'box', 'geometry', '3d', 'mesh'],
      order: 1,
    });

    this.registerNodeType({
      id: 'directionallight',
      displayName: 'Directional Light',
      description: '3D directional light source',
      category: '3D',
      commandClass: CreateDirectionalLightCommand,
      color: '#fe9ebeff',
      icon: 'sun',
      keywords: ['create', 'light', 'directional', '3d', 'illumination'],
      order: 2,
    });

    this.registerNodeType({
      id: 'pointlight',
      displayName: 'Point Light',
      description: '3D point light source',
      category: '3D',
      commandClass: CreatePointLightCommand,
      color: '#fe9ebeff',
      icon: 'sun',
      keywords: ['create', 'light', 'point', '3d', 'illumination'],
      order: 3,
    });

    this.registerNodeType({
      id: 'spotlight',
      displayName: 'Spot Light',
      description: '3D spot light source',
      category: '3D',
      commandClass: CreateSpotLightCommand,
      color: '#fe9ebeff',
      icon: 'sun',
      keywords: ['create', 'light', 'spot', '3d', 'illumination'],
      order: 4,
    });

    this.registerNodeType({
      id: 'camera3d',
      displayName: 'Camera3D',
      description: '3D camera for viewing the scene',
      category: '3D',
      commandClass: CreateCamera3DCommand,
      color: '#fe9ebeff',
      icon: 'camera',
      keywords: ['create', 'camera', '3d', 'viewport', 'perspective'],
      order: 3,
    });

    this.registerNodeType({
      id: 'meshinstance',
      displayName: 'Mesh Instance',
      description: '3D model import (GLB/GLTF)',
      category: '3D',
      commandClass: CreateMeshInstanceCommand,
      color: '#fe9ebeff',
      icon: 'package',
      keywords: ['create', 'mesh', 'model', '3d', 'import', 'glb', 'gltf'],
      order: 4,
    });

    this.registerNodeType({
      id: 'sprite3d',
      displayName: 'Sprite3D',
      description: 'Textured quad in 3D space with optional camera billboarding',
      category: '3D',
      commandClass: CreateSprite3DCommand,
      color: '#fe9ebeff',
      icon: 'image',
      keywords: ['create', 'sprite', '3d', 'image', 'texture', 'billboard', 'marker'],
      order: 5,
    });
  }

  private registerNodeType(nodeType: NodeTypeInfo): void {
    this.nodeTypes.set(nodeType.id, nodeType);
  }

  /**
   * Get all node types organized by category
   */
  public getNodeTypesByCategory(): { '2D': NodeTypeInfo[]; '3D': NodeTypeInfo[] } {
    const categories: { '2D': NodeTypeInfo[]; '3D': NodeTypeInfo[] } = {
      '2D': [],
      '3D': [],
    };

    for (const nodeType of this.nodeTypes.values()) {
      categories[nodeType.category].push(nodeType);
    }

    // Sort by order within each category
    for (const category of Object.keys(categories) as Array<'2D' | '3D'>) {
      categories[category].sort((a: NodeTypeInfo, b: NodeTypeInfo) => a.order - b.order);
    }

    return categories;
  }

  /**
   * Get all node types
   */
  public getAllNodeTypes(): NodeTypeInfo[] {
    return Array.from(this.nodeTypes.values()).sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.order - b.order;
    });
  }

  /**
   * Get a specific node type by ID
   */
  public getNodeType(id: string): NodeTypeInfo | undefined {
    return this.nodeTypes.get(id);
  }

  /**
   * Create a command instance for node creation by registry ID.
   */
  public createCommand(id: string): Command<unknown, unknown> | null {
    const nodeType = this.nodeTypes.get(id);
    if (!nodeType) {
      return null;
    }
    return new nodeType.commandClass();
  }

  /**
   * Get node types for a specific category
   */
  public getNodeTypesByCategoryId(category: '2D' | '3D'): NodeTypeInfo[] {
    return this.getAllNodeTypes().filter(nodeType => nodeType.category === category);
  }

  /**
   * Search node types by keyword
   */
  public searchNodeTypes(query: string): NodeTypeInfo[] {
    const lowercaseQuery = query.toLowerCase();
    return this.getAllNodeTypes().filter(
      nodeType =>
        nodeType.displayName.toLowerCase().includes(lowercaseQuery) ||
        nodeType.description.toLowerCase().includes(lowercaseQuery) ||
        nodeType.keywords.some(keyword => keyword.toLowerCase().includes(lowercaseQuery))
    );
  }

  /**
   * Create dropdown items for UI consumption
   */
  public getDropdownItems(): Array<{
    id: string;
    label: string;
    icon: string;
    color: string;
    category: '2D' | '3D';
  }> {
    return this.getAllNodeTypes().map(nodeType => ({
      id: nodeType.id,
      label: nodeType.displayName,
      icon: nodeType.icon,
      color: nodeType.color,
      category: nodeType.category,
    }));
  }

  /**
   * Create grouped dropdown items for hierarchical UI
   */
  public getGroupedDropdownItems(): Array<{
    label: string;
    items: Array<{ id: string; label: string; icon: string; color: string }>;
  }> {
    const categories = this.getNodeTypesByCategory();
    const twoDNonUi = categories['2D'].filter(nodeType => nodeType.subcategory !== 'UI');
    const twoDUi = categories['2D'].filter(nodeType => nodeType.subcategory === 'UI');

    const groups: Array<{
      label: string;
      items: Array<{ id: string; label: string; icon: string; color: string }>;
    }> = [];

    if (twoDNonUi.length > 0) {
      groups.push({
        label: '2D Nodes',
        items: twoDNonUi.map(nodeType => ({
          id: nodeType.id,
          label: nodeType.displayName,
          icon: nodeType.icon,
          color: nodeType.color,
        })),
      });
    }

    if (twoDUi.length > 0) {
      groups.push({
        label: 'UI Controls',
        items: twoDUi.map(nodeType => ({
          id: nodeType.id,
          label: nodeType.displayName,
          icon: nodeType.icon,
          color: nodeType.color,
        })),
      });
    }

    groups.push({
      label: '3D Nodes',
      items: categories['3D'].map(nodeType => ({
        id: nodeType.id,
        label: nodeType.displayName,
        icon: nodeType.icon,
        color: nodeType.color,
      })),
    });

    return groups;
  }
}
