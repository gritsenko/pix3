import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { appState } from '@/state';

/**
 * Command to toggle grid visibility in the viewport.
 */
export class ToggleGridCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'view.toggle-grid',
    title: 'Toggle Grid',
    description: 'Show or hide the grid in the viewport',
    keywords: ['grid', 'viewport', 'toggle'],
    menuPath: 'view',
    keybinding: 'G',
    when: 'viewportFocused && !isInputFocused',
    addToMenu: true,
    menuOrder: 20,
  };

  preconditions(_context: CommandContext): CommandPreconditionResult {
    return { canExecute: true };
  }

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    appState.ui.showGrid = !appState.ui.showGrid;

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
