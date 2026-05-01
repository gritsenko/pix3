import {
  CommandBase,
  type CommandContext,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandPreconditionResult,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateAnimationAssetOperation,
  type CreateAnimationAssetOperationParams,
} from './CreateAnimationAssetOperation';

export interface CreateAnimationAssetCommandPayload {
  assetPath: string;
}

export class CreateAnimationAssetCommand extends CommandBase<
  CreateAnimationAssetCommandPayload,
  void
> {
  readonly metadata: CommandMetadata = {
    id: 'assets.create-animation-asset',
    title: 'Create Animation Asset',
    description: 'Create a .pix3anim asset in the project',
    keywords: ['animation', 'asset', 'spritesheet', 'pix3anim'],
  };

  constructor(private readonly params: CreateAnimationAssetOperationParams) {
    super();
  }

  preconditions(context: CommandContext): CommandPreconditionResult {
    if (context.state.project.status !== 'ready') {
      return {
        canExecute: false,
        reason: 'Project must be opened before creating animation assets',
        scope: 'project',
        recoverable: true,
      };
    }

    if (!this.params.assetPath.trim()) {
      return {
        canExecute: false,
        reason: 'Animation asset path is required',
        scope: 'project',
      };
    }

    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateAnimationAssetCommandPayload>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const pushed = await operations.invokeAndPush(new CreateAnimationAssetOperation(this.params));

    return {
      didMutate: pushed,
      payload: { assetPath: this.params.assetPath },
    };
  }
}
