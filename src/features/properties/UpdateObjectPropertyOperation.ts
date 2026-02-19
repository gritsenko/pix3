import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { NodeBase } from '@pix3/runtime';
import { Node2D } from '@pix3/runtime';
import { Group2D } from '@pix3/runtime';
import { Layout2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { ViewportRendererService } from '@/services/ViewportRenderService';
import { getNodePropertySchema } from '@pix3/runtime';
import type { PropertyDefinition } from '@/fw';
import type { ServiceContainer } from '@/fw/di';

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

    // Get property schema and definition
    const schema = getNodePropertySchema(node);
    const propDef = schema.properties.find(p => p.name === propertyPath);
    if (!propDef) {
      return { didMutate: false };
    }

    const validation = this.validatePropertyUpdate(node, propDef, value);
    if (!validation.isValid) {
      console.warn('[UpdateObjectPropertyOperation] Validation failed:', validation.reason);
      return { didMutate: false };
    }

    const previousValue = propDef.getValue(node);
    // Compare values as JSON strings to handle objects
    if (JSON.stringify(previousValue) === JSON.stringify(value)) {
      return { didMutate: false };
    }

    // Set the property value using the schema's setValue method
    propDef.setValue(node, value);

    const activeSceneId = state.scenes.activeSceneId;
    if (activeSceneId) {
      state.scenes.lastLoadedAt = Date.now();
      const descriptor = state.scenes.descriptors[activeSceneId];
      if (descriptor) descriptor.isDirty = true;
    }

    // Trigger viewport updates
    this.updateViewport(container, propertyPath, node);

    return {
      didMutate: true,
      commit: {
        label: `Update ${propDef.ui?.label || propertyPath}`,
        beforeSnapshot: context.snapshot,
        undo: async () => {
          propDef.setValue(node, previousValue);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          this.updateViewport(container, propertyPath, node);
        },
        redo: async () => {
          propDef.setValue(node, value);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          this.updateViewport(container, propertyPath, node);
        },
      },
    };
  }

  private updateViewport(container: ServiceContainer, propertyPath: string, node: NodeBase) {
    try {
      const vr = container.getService(
        container.getOrCreateToken(ViewportRendererService)
      ) as ViewportRendererService;
      const isTransform = this.isTransformProperty(propertyPath);
      const is2DVisualProperty = this.is2DVisualProperty(propertyPath);
      if (isTransform) {
        vr.updateNodeTransform(node);
      } else if (is2DVisualProperty && node instanceof Node2D) {
        vr.updateNodeTransform(node);
        if (this.isParentSizeProperty(propertyPath) && this.is2DContainer(node)) {
          this.updateDescendant2DTransforms(vr, node);
        }
      } else if (propertyPath === 'visible') {
        vr.updateNodeVisibility(node);
      } else {
        vr.updateSelection();
      }
    } catch {
      // Silently ignore viewport renderer errors
    }
  }

  private isTransformProperty(propertyPath: string): boolean {
    return ['position', 'rotation', 'scale'].includes(propertyPath);
  }

  private is2DVisualProperty(propertyPath: string): boolean {
    return [
      'width',
      'height',
      'size',
      'radius',
      'handleRadius',
      'showViewportOutline',
      'resolutionPreset',
      'label',
      'labelFontFamily',
      'labelFontSize',
      'labelColor',
      'labelAlign',
      'texturePath',
      'backgroundColor',
      'hoverColor',
      'pressedColor',
      'trackBackgroundColor',
      'trackFilledColor',
      'handleColor',
      'backdropColor',
      'borderColor',
      'selectionColor',
      'uncheckedColor',
      'checkedColor',
      'checkmarkColor',
      'barColor',
      'backBackgroundColor',
      'showBorder',
      'quantity',
      'showQuantity',
      'quantityFontSize',
      'enabled',
      'checked',
      'value',
      'minValue',
      'maxValue',
      'handleSize',
    ].includes(propertyPath);
  }

  private isParentSizeProperty(propertyPath: string): boolean {
    return ['width', 'height', 'resolutionPreset'].includes(propertyPath);
  }

  private is2DContainer(node: NodeBase): node is Layout2D | Group2D {
    return node instanceof Layout2D || node instanceof Group2D;
  }

  private updateDescendant2DTransforms(vr: ViewportRendererService, parent: NodeBase): void {
    for (const child of parent.children) {
      if (child instanceof Node2D) {
        vr.updateNodeTransform(child);
      }
      this.updateDescendant2DTransforms(vr, child);
    }
  }

  private validatePropertyUpdate(
    _node: NodeBase,
    _propDef: PropertyDefinition,
    value: unknown
  ): { isValid: boolean; reason?: string } {
    if (value === null || value === undefined) {
      return { isValid: false, reason: 'Value cannot be null or undefined' };
    }
    return { isValid: true };
  }
}
