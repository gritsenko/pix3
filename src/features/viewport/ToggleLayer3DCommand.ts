import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { ToggleUIFlagOperation } from './ToggleUIFlagOperation';

export class ToggleLayer3DCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'view.toggle-layer-3d',
    title: 'Toggle 3D Layer',
    description: 'Show or hide the 3D layer in the viewport',
    keywords: ['3d', 'layer', 'viewport', 'toggle'],
    menuPath: 'view',
    keybinding: '3',
    when: 'viewportFocused && !isInputFocused',
    addToMenu: true,
    menuOrder: 22,
  };

  preconditions(_context: CommandContext): CommandPreconditionResult {
    return { canExecute: true };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<void>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    await operations.invoke(new ToggleUIFlagOperation('showLayer3D', 'Toggle 3D Layer'));

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
