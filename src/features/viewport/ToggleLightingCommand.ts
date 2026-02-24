import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { appState } from '@/state';

/**
 * Command to toggle lighting visibility in the viewport.
 */
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

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    appState.ui.showLighting = !appState.ui.showLighting;

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
