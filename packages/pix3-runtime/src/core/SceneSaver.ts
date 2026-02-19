import { stringify } from 'yaml';
import { MathUtils, PerspectiveCamera, OrthographicCamera } from 'three';

import { NodeBase } from '../nodes/NodeBase';
import { Node3D } from '../nodes/Node3D';
import { Node2D } from '../nodes/Node2D';
import { Group2D } from '../nodes/2D/Group2D';
import { Layout2D } from '../nodes/2D/Layout2D';
import { Sprite2D } from '../nodes/2D/Sprite2D';
import { Joystick2D } from '../nodes/2D/UI/Joystick2D';
import { UIControl2D } from '../nodes/2D/UI/UIControl2D';
import { Button2D } from '../nodes/2D/UI/Button2D';
import { Slider2D } from '../nodes/2D/UI/Slider2D';
import { Bar2D } from '../nodes/2D/UI/Bar2D';
import { Checkbox2D } from '../nodes/2D/UI/Checkbox2D';
import { InventorySlot2D } from '../nodes/2D/UI/InventorySlot2D';
import { Label2D } from '../nodes/2D/UI/Label2D';
import { DirectionalLightNode } from '../nodes/3D/DirectionalLightNode';
import { PointLightNode } from '../nodes/3D/PointLightNode';
import { SpotLightNode } from '../nodes/3D/SpotLightNode';
import { GeometryMesh } from '../nodes/3D/GeometryMesh';
import { Camera3D } from '../nodes/3D/Camera3D';
import { MeshInstance } from '../nodes/3D/MeshInstance';
import type { SceneGraph } from './SceneManager';
import type { SceneNodeDefinition } from './SceneLoader';

interface SceneDocument {
  version: string;
  description?: string;
  metadata?: Record<string, unknown>;
  root: SceneNodeDefinition[];
}

export class SceneSaver {
  constructor() { }

  /**
   * Serialize a scene graph back to YAML format for saving.
   */
  serializeScene(graph: SceneGraph): string {
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

    // Replace expanded layout anchor/offset arrays with inline format
    yaml = yaml.replace(
      /anchorMin:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'anchorMin: [$1, $2]'
    );
    yaml = yaml.replace(
      /anchorMax:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'anchorMax: [$1, $2]'
    );
    yaml = yaml.replace(
      /offsetMin:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'offsetMin: [$1, $2]'
    );
    yaml = yaml.replace(
      /offsetMax:\s*\n\s*- ([\d.-]+)\n\s*- ([\d.-]+)/g,
      'offsetMax: [$1, $2]'
    );

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
    } else if (node instanceof PointLightNode) {
      definition.type = 'PointLightNode';
    } else if (node instanceof SpotLightNode) {
      definition.type = 'SpotLightNode';
    }

    if (node.instancePath) {
      definition.instance = node.instancePath;
    }

    // Serialize components
    if (node.components.length > 0) {
      definition.components = node.components.map(c => ({
        id: c.id,
        type: c.type,
        enabled: c.enabled,
        config: c.config && Object.keys(c.config).length > 0 ? c.config : undefined,
      }));
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
    } else if (node instanceof Layout2D) {
      // Serialize Layout2D with viewport properties
      props.width = node.width;
      props.height = node.height;
      props.resolutionPreset = node.resolutionPreset;
      props.showViewportOutline = node.showViewportOutline;

      // Add 2D transform
      const transform: Record<string, unknown> = {
        position: [node.position.x, node.position.y],
        scale: [node.scale.x, node.scale.y],
        rotation: MathUtils.radToDeg(node.rotation.z),
      };
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

      // Serialize layout properties (only if non-default)
      const anchorMin = node.anchorMin;
      const anchorMax = node.anchorMax;
      const offsetMin = node.offsetMin;
      const offsetMax = node.offsetMax;

      // Default anchors are (0.5, 0.5) - only save if different
      const hasCustomAnchors =
        anchorMin.x !== 0.5 ||
        anchorMin.y !== 0.5 ||
        anchorMax.x !== 0.5 ||
        anchorMax.y !== 0.5;

      // Default offsets depend on size, so save if anchors are custom or offsets are non-zero
      const hasCustomOffsets =
        hasCustomAnchors ||
        offsetMin.x !== -node.width / 2 ||
        offsetMin.y !== -node.height / 2 ||
        offsetMax.x !== node.width / 2 ||
        offsetMax.y !== node.height / 2;

      if (hasCustomAnchors || hasCustomOffsets) {
        const layout: Record<string, unknown> = {};

        if (hasCustomAnchors) {
          // Round anchors to 2 decimal places
          layout.anchorMin = [
            Math.round(anchorMin.x * 100) / 100,
            Math.round(anchorMin.y * 100) / 100,
          ];
          layout.anchorMax = [
            Math.round(anchorMax.x * 100) / 100,
            Math.round(anchorMax.y * 100) / 100,
          ];
        }

        if (hasCustomOffsets) {
          // Round offsets to integers for 2D pixel precision
          layout.offsetMin = [Math.round(offsetMin.x), Math.round(offsetMin.y)];
          layout.offsetMax = [Math.round(offsetMax.x), Math.round(offsetMax.y)];
        }

        props.layout = layout;
      }
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
      // Save width/height in pixels
      props.width = node.width;
      props.height = node.height;
    } else if (node instanceof Joystick2D) {
      if (node.radius !== 50) props.radius = node.radius;
      if (node.handleRadius !== 20) props.handleRadius = node.handleRadius;
      if (node.axisHorizontal !== 'Horizontal') props.axisHorizontal = node.axisHorizontal;
      if (node.axisVertical !== 'Vertical') props.axisVertical = node.axisVertical;
      if (node.baseColor !== '#ffffff') props.baseColor = node.baseColor;
      if (node.handleColor !== '#cccccc') props.handleColor = node.handleColor;
      if (node.floating !== false) props.floating = node.floating;
    } else if (node instanceof Button2D) {
      this.serializeCommonUIControlProps(node, props);
      props.width = node.width;
      props.height = node.height;
      props.backgroundColor = node.backgroundColor;
      props.hoverColor = node.hoverColor;
      props.pressedColor = node.pressedColor;
      props.buttonAction = node.buttonAction;
    } else if (node instanceof Label2D) {
      this.serializeCommonUIControlProps(node, props);
    } else if (node instanceof Slider2D) {
      this.serializeCommonUIControlProps(node, props);
      props.width = node.width;
      props.height = node.height;
      props.handleSize = node.handleSize;
      props.trackBackgroundColor = node.trackBackgroundColor;
      props.trackFilledColor = node.trackFilledColor;
      props.handleColor = node.handleColor;
      props.minValue = node.minValue;
      props.maxValue = node.maxValue;
      props.value = node.value;
      props.axisName = node.axisName;
    } else if (node instanceof Bar2D) {
      this.serializeCommonUIControlProps(node, props);
      props.width = node.width;
      props.height = node.height;
      props.backBackgroundColor = node.backBackgroundColor;
      props.barColor = node.barColor;
      props.minValue = node.minValue;
      props.maxValue = node.maxValue;
      props.value = node.value;
      props.showBorder = node.showBorder;
      props.borderColor = node.borderColor;
      props.borderWidth = node.borderWidth;
    } else if (node instanceof Checkbox2D) {
      this.serializeCommonUIControlProps(node, props);
      props.size = node.size;
      props.checked = node.checked;
      props.uncheckedColor = node.uncheckedColor;
      props.checkedColor = node.checkedColor;
      props.checkmarkColor = node.checkmarkColor;
      props.checkmarkAction = node.checkmarkAction;
    } else if (node instanceof InventorySlot2D) {
      this.serializeCommonUIControlProps(node, props);
      props.width = node.width;
      props.height = node.height;
      props.backdropColor = node.backdropColor;
      props.borderColor = node.borderColor;
      props.borderWidth = node.borderWidth;
      props.quantity = node.quantity;
      props.showQuantity = node.showQuantity;
      props.quantityFontSize = node.quantityFontSize;
      props.selectionColor = node.selectionColor;
      props.selectedAction = node.selectedAction;
    } else if (node instanceof GeometryMesh) {
      const mesh = node as GeometryMesh & {
        geometry?: unknown;
        size?: unknown;
        material?: unknown;
      };
      if (typeof mesh.geometry === 'string') props.geometry = mesh.geometry;
      if (Array.isArray(mesh.size)) props.size = mesh.size as [number, number, number];
      if (typeof mesh.material === 'object' && mesh.material !== null) {
        props.material = mesh.material as {
          color?: string;
          roughness?: number;
          metalness?: number;
        };
      }
    } else if (node instanceof DirectionalLightNode) {
      props.color = '#' + node.light.color.getHexString();
      props.intensity = node.light.intensity;
      props.castShadow = node.light.castShadow;
    } else if (node instanceof PointLightNode) {
      props.color = '#' + node.light.color.getHexString();
      props.intensity = node.light.intensity;
      props.distance = node.light.distance;
      props.decay = node.light.decay;
      props.castShadow = node.light.castShadow;
    } else if (node instanceof SpotLightNode) {
      props.color = '#' + node.light.color.getHexString();
      props.intensity = node.light.intensity;
      props.distance = node.light.distance;
      props.angle = (node.light.angle * 180) / Math.PI;
      props.penumbra = node.light.penumbra;
      props.decay = node.light.decay;
      props.castShadow = node.light.castShadow;
    } else if (node instanceof Camera3D) {
      if (node.camera instanceof PerspectiveCamera) {
        props.projection = 'perspective';
        props.fov = node.camera.fov;
        props.near = node.camera.near;
        props.far = node.camera.far;
      } else if (node.camera instanceof OrthographicCamera) {
        props.projection = 'orthographic';
        props.near = node.camera.near;
        props.far = node.camera.far;
      }
    } else if (node instanceof MeshInstance) {
      const inst = node as MeshInstance;
      if (inst.src) {
        props.src = inst.src as string;
      }
      props.castShadow = inst.castShadow;
      props.receiveShadow = inst.receiveShadow;
    }

    return props;
  }

  private serializeCommonUIControlProps(node: UIControl2D, props: Record<string, unknown>): void {
    if (node.enabled !== true) props.enabled = node.enabled;
    if (node.label !== '') props.label = node.label;
    if (node.labelFontFamily !== 'Arial') props.labelFontFamily = node.labelFontFamily;
    if (node.labelFontSize !== 16) props.labelFontSize = node.labelFontSize;
    if (node.labelColor !== '#ffffff') props.labelColor = node.labelColor;
    if (node.labelAlign !== 'center') props.labelAlign = node.labelAlign;
    if (node.texturePath) props.texturePath = node.texturePath;
  }
}
