import { stringify } from 'yaml';
import { MathUtils } from 'three';

import { injectable } from '@/fw/di';
import { NodeBase } from '@/nodes/NodeBase';
import { Node3D } from '@/nodes/Node3D';
import { Node2D } from '@/nodes/Node2D';
import { Group2D } from '@/nodes/2D/Group2D';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { DirectionalLightNode } from '@/nodes/3D/DirectionalLightNode';
import { GeometryMesh } from '@/nodes/3D/GeometryMesh';
import { Camera3D } from '@/nodes/3D/Camera3D';
import { MeshInstance } from '@/nodes/3D/MeshInstance';
import type { SceneGraph } from './SceneManager';
import type { SceneNodeDefinition } from './SceneLoader';

interface SceneDocument {
  version: string;
  description?: string;
  metadata?: Record<string, unknown>;
  root: SceneNodeDefinition[];
}

@injectable()
export class SceneSaver {
  constructor() {}

  /**
   * Serialize a scene graph back to YAML format for saving.
   */
  serializeScene(graph: SceneGraph): string {
    console.debug('[SceneSaver] Starting serialization', {
      rootNodeCount: graph.rootNodes.length,
      version: graph.version,
    });

    const rootDefinitions: SceneNodeDefinition[] = graph.rootNodes.map(node =>
      this.serializeNode(node)
    );

    const document: SceneDocument = {
      version: graph.version ?? '1.0.0',
      description: graph.description,
      metadata: graph.metadata,
      root: rootDefinitions,
    };

    // Custom YAML stringification to keep vectors as inline arrays
    let yaml = stringify(document, { indent: 2 });

    // Replace expanded position arrays with inline format
    yaml = yaml.replace(
      /position:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'position: [$1, $2, $3]'
    );
    yaml = yaml.replace(
      /position:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)(?!\s*-)/g,
      'position: [$1, $2]'
    );

    // Replace expanded rotationEuler arrays with inline format
    yaml = yaml.replace(
      /rotationEuler:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'rotationEuler: [$1, $2, $3]'
    );

    // Replace expanded scale arrays with inline format
    yaml = yaml.replace(
      /scale:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'scale: [$1, $2, $3]'
    );
    yaml = yaml.replace(/scale:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)(?!\s*-)/g, 'scale: [$1, $2]');

    // Replace expanded rotation arrays with inline format (2D)
    yaml = yaml.replace(
      /rotation:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)\n\s*- (\w+)/g,
      'rotation: [$1, $2, $3, $4]'
    );
    yaml = yaml.replace(
      /rotation:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)(?!\s*-)/g,
      'rotation: [$1, $2]'
    );

    // Replace expanded size arrays with inline format
    yaml = yaml.replace(
      /size:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'size: [$1, $2, $3]'
    );
    yaml = yaml.replace(/size:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)(?!\s*-)/g, 'size: [$1, $2]');

    // Replace expanded pivot arrays with inline format
    yaml = yaml.replace(/pivot:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g, 'pivot: [$1, $2]');

    console.debug('[SceneSaver] Serialization complete', {
      yamlLength: yaml.length,
      rootDefinitionCount: rootDefinitions.length,
    });

    return yaml;
  }

  private serializeNode(node: NodeBase): SceneNodeDefinition {
    // First, get the properties (this might modify the type for DirectionalLightNode)
    const properties = this.serializeNodeProperties(node);

    const definition: SceneNodeDefinition = {
      id: node.nodeId,
      type: node.type !== 'Group' ? node.type : undefined,
      name: node.name,
      properties: properties,
      metadata: node.metadata && Object.keys(node.metadata).length > 0 ? node.metadata : undefined,
    };

    // Ensure correct type for DirectionalLightNode
    if (node instanceof DirectionalLightNode) {
      definition.type = 'DirectionalLightNode';
    }

    if (node.instancePath) {
      definition.instance = node.instancePath;
    }

    // Recursively serialize children
    if (node.children && node.children.length > 0) {
      definition.children = node.children
        .filter((child): child is NodeBase => child instanceof NodeBase)
        .map(child => this.serializeNode(child));
    }

    // Remove undefined properties to keep YAML clean
    Object.keys(definition).forEach(key => {
      if (definition[key as keyof SceneNodeDefinition] === undefined) {
        delete definition[key as keyof SceneNodeDefinition];
      }
    });

    return definition;
  }

  private serializeNodeProperties(node: NodeBase): Record<string, unknown> {
    const props: Record<string, unknown> = { ...node.properties };

    // Remove flat transform properties - we'll use the transform wrapper instead
    delete props.position;
    delete props.rotation;
    delete props.scale;
    delete props.rotationEuler;
    delete props.rotationOrder;
    delete props.transform;

    // Serialize 3D transforms if this is a Node3D
    if (node instanceof Node3D) {
      // Convert rotation from radians back to degrees for YAML
      const rotation = node.rotation;
      const transform: Record<string, unknown> = {
        position: [node.position.x, node.position.y, node.position.z],
        rotationEuler: [
          MathUtils.radToDeg(rotation.x),
          MathUtils.radToDeg(rotation.y),
          MathUtils.radToDeg(rotation.z),
        ],
        scale: [node.scale.x, node.scale.y, node.scale.z],
      };

      // Add transform metadata if rotation order is not default
      if (rotation.order && rotation.order !== 'XYZ') {
        transform.rotationOrder = rotation.order;
      }

      props.transform = transform;
    } else if (node instanceof Group2D) {
      // Serialize Group2D with size properties
      props.width = node.width;
      props.height = node.height;

      // Add 2D transform
      const transform: Record<string, unknown> = {
        position: [node.position.x, node.position.y],
        scale: [node.scale.x, node.scale.y],
        rotation: MathUtils.radToDeg(node.rotation.z),
      };
      props.transform = transform;
    } else if (node instanceof Node2D) {
      // Generic Node2D transform
      const transform: Record<string, unknown> = {
        position: [node.position.x, node.position.y],
        scale: [node.scale.x, node.scale.y],
        rotation: MathUtils.radToDeg(node.rotation.z),
      };

      props.transform = transform;
    }

    // Serialize specific node type properties
    if (node instanceof Sprite2D) {
      if (node.texturePath) {
        props.texturePath = node.texturePath;
      }
    } else if (node instanceof GeometryMesh) {
      const mesh = node as any;
      if (mesh.geometry) props.geometry = mesh.geometry;
      if (mesh.size) props.size = mesh.size;
      if (mesh.material) props.material = mesh.material;
    } else if (node instanceof DirectionalLightNode) {
      const light = node as any;
      if (light.color) props.color = light.color;
      if (light.intensity) props.intensity = light.intensity;
    } else if (node instanceof Camera3D) {
      const camera = node as any;
      if (camera.projection) props.projection = camera.projection;
      if (camera.fov) props.fov = camera.fov;
      if (camera.near) props.near = camera.near;
      if (camera.far) props.far = camera.far;
    } else if (node instanceof MeshInstance) {
      const mesh = node as any;
      if (mesh.src) {
        props.src = mesh.src;
      }
    }

    return props;
  }

  dispose(): void {
    // No resources to clean up
  }
}
