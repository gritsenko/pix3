import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { appState } from '@/state';

/**
 * Command to toggle 3D layer visibility in the viewport.
 */
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

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    appState.ui.showLayer3D = !appState.ui.showLayer3D;

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
