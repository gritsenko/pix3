import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { PropertyDefinition } from '@/fw';
import { SceneManager, ScriptRegistry } from '@pix3/runtime';

export interface UpdateComponentPropertyParams {
  nodeId: string;
  componentId: string;
  propertyName: string;
  value: unknown;
}

export class UpdateComponentPropertyOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scripts.update-component-property',
    title: 'Update Component Property',
    description: 'Update a script component property on a node',
    affectsNodeStructure: false,
    tags: ['scripts', 'component', 'property'],
  };

  private readonly params: UpdateComponentPropertyParams;

  constructor(params: UpdateComponentPropertyParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container, state } = context;

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const scriptRegistry = container.getService<ScriptRegistry>(
      container.getOrCreateToken(ScriptRegistry)
    );

    const scene = sceneManager.getActiveSceneGraph();
    if (!scene) {
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      return { didMutate: false };
    }

    const component = node.components.find(c => c.id === this.params.componentId);
    if (!component) {
      return { didMutate: false };
    }

    const schema = scriptRegistry.getComponentPropertySchema(component.type);
    if (!schema) {
      return { didMutate: false };
    }

    const propDef = schema.properties.find(p => p.name === this.params.propertyName);
    if (!propDef) {
      return { didMutate: false };
    }

    if (!this.validatePropertyUpdate(propDef, this.params.value)) {
      return { didMutate: false };
    }

    const previousValue = propDef.getValue(component);
    if (JSON.stringify(previousValue) === JSON.stringify(this.params.value)) {
      return { didMutate: false };
    }

    propDef.setValue(component, this.params.value);

    const activeSceneId = state.scenes.activeSceneId;
    this.markSceneDirty(state, activeSceneId);

    return {
      didMutate: true,
      commit: {
        label: `Update ${component.type}.${propDef.ui?.label ?? propDef.name}`,
        beforeSnapshot: context.snapshot,
        undo: async () => {
          propDef.setValue(component, previousValue);
          this.markSceneDirty(state, activeSceneId);
        },
        redo: async () => {
          propDef.setValue(component, this.params.value);
          this.markSceneDirty(state, activeSceneId);
        },
      },
    };
  }

  private markSceneDirty(state: OperationContext['state'], activeSceneId: string | null): void {
    if (!activeSceneId) {
      return;
    }

    const descriptor = state.scenes.descriptors[activeSceneId];
    if (descriptor) {
      descriptor.isDirty = true;
    }

    state.scenes.lastLoadedAt = Date.now();
  }

  private validatePropertyUpdate(propDef: PropertyDefinition, value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (!propDef.validation?.validate) {
      return true;
    }

    const result = propDef.validation.validate(value);
    return result === true;
  }
}
