/**
 * ToggleScriptEnabledCommand - Command to toggle script enabled state
 */

import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  ToggleScriptEnabledOperation,
  type ToggleScriptEnabledParams,
} from './ToggleScriptEnabledOperation';

export class ToggleScriptEnabledCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.toggle-enabled',
    title: 'Toggle Script Enabled',
    description: 'Enable or disable a behavior or controller',
    keywords: ['toggle', 'enable', 'disable', 'behavior', 'controller'],
  };

  private readonly params: ToggleScriptEnabledParams;

  constructor(params: ToggleScriptEnabledParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new ToggleScriptEnabledOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
