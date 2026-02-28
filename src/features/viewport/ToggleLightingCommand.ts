import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { ToggleUIFlagOperation } from './ToggleUIFlagOperation';

export class ToggleLightingCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'view.toggle-lighting',
    title: 'Toggle Lighting',
    description: 'Show or hide lighting in the viewport',
    keywords: ['lighting', 'viewport', 'toggle'],
    menuPath: 'view',
    keybinding: 'L',
    when: 'viewportFocused && !isInputFocused',
    addToMenu: true,
    menuOrder: 23,
  };

  preconditions(_context: CommandContext): CommandPreconditionResult {
    return { canExecute: true };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<void>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    await operations.invoke(new ToggleUIFlagOperation('showLighting', 'Toggle Lighting'));

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
