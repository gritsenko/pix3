import { CreateGroup2DCommand } from '@/features/scene/CreateGroup2DCommand';
import { CreateSprite2DCommand } from '@/features/scene/CreateSprite2DCommand';
import { CreateBoxCommand } from '@/features/scene/CreateBoxCommand';
import { CreateDirectionalLightCommand } from '@/features/scene/CreateDirectionalLightCommand';
import { CreateCamera3DCommand } from '@/features/scene/CreateCamera3DCommand';
import { CreateMeshInstanceCommand } from '@/features/scene/CreateMeshInstanceCommand';

/**
 * Node type definition for the registry
 */
export interface NodeTypeInfo {
  id: string;
  displayName: string;
  description: string;
  category: '2D' | '3D';
  commandClass: new (...args: any[]) => any;
  color: string;
  icon: string;
  keywords: string[];
  order: number;
}

/**
 * Registry of all available node types organized by category
 */
export class NodeRegistry {
  private static instance: NodeRegistry;
  private nodeTypes: Map<string, NodeTypeInfo> = new Map();

  private constructor() {
    this.registerNodeTypes();
  }

  public static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }

  private registerNodeTypes(): void {
    // 2D Node Types
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
    return this.getAllNodeTypes().filter(nodeType =>
      nodeType.displayName.toLowerCase().includes(lowercaseQuery) ||
      nodeType.description.toLowerCase().includes(lowercaseQuery) ||
      nodeType.keywords.some(keyword => keyword.toLowerCase().includes(lowercaseQuery))
    );
  }

  /**
   * Create dropdown items for UI consumption
   */
  public getDropdownItems(): Array<{ id: string; label: string; icon: string; color: string; category: '2D' | '3D' }> {
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
    
    return [
      {
        label: '2D Nodes',
        items: categories['2D'].map(nodeType => ({
          id: nodeType.id,
          label: nodeType.displayName,
          icon: nodeType.icon,
          color: nodeType.color,
        })),
      },
      {
        label: '3D Nodes',
        items: categories['3D'].map(nodeType => ({
          id: nodeType.id,
          label: nodeType.displayName,
          icon: nodeType.icon,
          color: nodeType.color,
        })),
      },
    ];
  }
}