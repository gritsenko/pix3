import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { appState } from '@/state';

/**
 * Command to toggle 2D layer visibility in the viewport.
 */
export class ToggleLayer2DCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'view.toggle-layer-2d',
    title: 'Toggle 2D Layer',
    description: 'Show or hide the 2D layer in the viewport',
    keywords: ['2d', 'layer', 'viewport', 'toggle'],
    menuPath: 'view',
    keybinding: '2',
    when: 'viewportFocused && !isInputFocused',
    addToMenu: true,
    menuOrder: 21,
  };

  preconditions(_context: CommandContext): CommandPreconditionResult {
    return { canExecute: true };
  }

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    appState.ui.showLayer2D = !appState.ui.showLayer2D;

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
