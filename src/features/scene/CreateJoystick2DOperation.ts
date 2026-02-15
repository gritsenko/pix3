import type {
    Operation,
    OperationContext,
    OperationInvokeResult,
    OperationMetadata,
} from '@/core/Operation';
import type { NodeBase } from '@pix3/runtime';
import { Joystick2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { ref } from 'valtio/vanilla';
import { Vector2 } from 'three';

export interface CreateJoystick2DOperationParams {
    joystickName?: string;
    radius?: number;
    handleRadius?: number;
    position?: Vector2;
    parentNodeId?: string | null;
}

export class CreateJoystick2DOperation implements Operation<OperationInvokeResult> {
    readonly metadata: OperationMetadata = {
        id: 'scene.create-joystick2d',
        title: 'Create Joystick2D',
        description: 'Create a 2D joystick in the scene',
        tags: ['scene', '2d', 'joystick', 'node'],
        affectsNodeStructure: true,
    };

    private readonly params: CreateJoystick2DOperationParams;

    constructor(params: CreateJoystick2DOperationParams = {}) {
        this.params = params;
    }

    async perform(context: OperationContext): Promise<OperationInvokeResult> {
        const { state, container } = context;
        const activeSceneId = state.scenes.activeSceneId;

        if (!activeSceneId) {
            return { didMutate: false };
        }

        const sceneManager = container.getService<SceneManager>(
            container.getOrCreateToken(SceneManager)
        );
        const sceneGraph = sceneManager.getSceneGraph(activeSceneId);
        if (!sceneGraph) {
            return { didMutate: false };
        }

        const nodeId = `joystick2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const joystickName = this.params.joystickName || 'Joystick2D';

        const node = new Joystick2D({
            id: nodeId,
            name: joystickName,
            position: this.params.position || new Vector2(100, 100), // Default position for visibility
            radius: this.params.radius,
            handleRadius: this.params.handleRadius,
        });

        const parentNodeId = this.params.parentNodeId ?? null;
        const parentNode = parentNodeId ? (sceneGraph.nodeMap.get(parentNodeId) ?? null) : null;

        const updateHierarchyState = () => {
            const hierarchy = state.scenes.hierarchies[activeSceneId];
            if (hierarchy) {
                state.scenes.hierarchies[activeSceneId] = {
                    version: hierarchy.version,
                    description: hierarchy.description,
                    rootNodes: ref([...sceneGraph.rootNodes]),
                    metadata: hierarchy.metadata,
                };
            }
        };

        const markSceneDirty = () => {
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) {
                descriptor.isDirty = true;
            }
        };

        const selectCreatedNode = () => {
            state.selection.nodeIds = [nodeId];
            state.selection.primaryNodeId = nodeId;
        };

        const clearSelectionIfTargeted = () => {
            if (state.selection.nodeIds.includes(nodeId)) {
                state.selection.nodeIds = [];
                state.selection.primaryNodeId = null;
            }
        };

        const attachNode = (targetParent: NodeBase | null) => {
            if (targetParent) {
                targetParent.adoptChild(node);
            } else {
                sceneGraph.rootNodes.push(node);
            }
            sceneGraph.nodeMap.set(nodeId, node);
            updateHierarchyState();
            markSceneDirty();
        };

        const detachNode = (targetParent: NodeBase | null) => {
            if (targetParent) {
                targetParent.disownChild(node);
            } else {
                sceneGraph.rootNodes = sceneGraph.rootNodes.filter(n => n.nodeId !== nodeId);
            }
            sceneGraph.nodeMap.delete(nodeId);
            updateHierarchyState();
            markSceneDirty();
        };

        attachNode(parentNode);
        selectCreatedNode();

        return {
            didMutate: true,
            commit: {
                label: `Create ${joystickName}`,
                undo: () => {
                    detachNode(parentNode);
                    clearSelectionIfTargeted();
                },
                redo: () => {
                    attachNode(parentNode);
                    selectCreatedNode();
                },
            },
        };
    }
}
