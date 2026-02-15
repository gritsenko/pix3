import {
    CommandBase,
    type CommandExecutionResult,
    type CommandMetadata,
    type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
    CreateJoystick2DOperation,
    type CreateJoystick2DOperationParams,
} from '@/features/scene/CreateJoystick2DOperation';
import { SceneManager } from '@pix3/runtime';

export interface CreateJoystick2DCommandPayload {
    nodeId: string;
}

export class CreateJoystick2DCommand extends CommandBase<CreateJoystick2DCommandPayload, void> {
    readonly metadata: CommandMetadata = {
        id: 'scene.create-joystick2d',
        title: 'Create Joystick2D',
        description: 'Create a new 2D joystick in the scene',
        keywords: ['create', 'joystick', '2d', 'input', 'add'],
    };

    private readonly params: CreateJoystick2DOperationParams;

    constructor(params: CreateJoystick2DOperationParams = {}) {
        super();
        this.params = params;
    }

    preconditions(context: CommandContext) {
        const sceneManager = context.container.getService<SceneManager>(
            context.container.getOrCreateToken(SceneManager)
        );
        const hasActiveScene = Boolean(sceneManager.getActiveSceneGraph());
        if (!hasActiveScene) {
            return {
                canExecute: false,
                reason: 'An active scene is required to create a Joystick2D',
                scope: 'scene' as const,
            };
        }
        return { canExecute: true };
    }

    async execute(
        context: CommandContext
    ): Promise<CommandExecutionResult<CreateJoystick2DCommandPayload>> {
        const operationService = context.container.getService<OperationService>(
            context.container.getOrCreateToken(OperationService)
        );
        const sceneManager = context.container.getService<SceneManager>(
            context.container.getOrCreateToken(SceneManager)
        );

        const op = new CreateJoystick2DOperation(this.params);
        const pushed = await operationService.invokeAndPush(op);

        // Get the created node ID from the scene graph
        const activeSceneGraph = sceneManager.getActiveSceneGraph();
        const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

        return { didMutate: pushed, payload: { nodeId } };
    }
}
