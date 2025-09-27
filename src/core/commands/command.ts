import { snapshot, type Snapshot } from 'valtio/vanilla';

import type { AppState, AppStateSnapshot, PersonaId } from '../../state';
import { ServiceContainer } from '../../fw/di';

/**
 * Unique identifier for a command. Use a stable namespace (e.g. `scene.select-node`).
 */
export type CommandId = string;

/**
 * Lifecycle status values reported through telemetry hooks.
 */
export type CommandTelemetryStatus = 'preconditions-blocked' | 'executed' | 'failed';

/**
 * Metadata describing the intent of a command. Used for palettes, shortcuts, and telemetry.
 */
export interface CommandMetadata {
  readonly id: CommandId;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly personas?: readonly PersonaId[];
}

/**
 * Context provided to commands when they run. The Valtio proxy is supplied so commands can
 * mutate state directly, while a snapshot offers a read-only baseline for diffing.
 */
export interface CommandContext {
  readonly state: AppState;
  readonly snapshot: AppStateSnapshot;
  readonly container: ServiceContainer;
  readonly requestedAt: number;
}

/**
 * Indicates whether a command can execute with the provided context.
 */
export type CommandPreconditionResult =
  | { canExecute: true }
  | {
      canExecute: false;
      reason?: string;
      recoverable?: boolean;
      scope?: 'project' | 'selection' | 'scene' | 'service' | 'external';
    };

/**
 * Result returned from `execute`. Commands may return arbitrary data required by `postCommit`
 * to construct an undo payload or emit follow-up events.
 */
export interface CommandExecutionResult<TExecutePayload = void> {
  readonly didMutate: boolean;
  readonly payload: TExecutePayload;
}

/**
 * Undo payload returned from `postCommit`. Stored by the HistoryManager for future undo calls.
 */
export type CommandUndoPayload<TUndoPayload = void> = TUndoPayload;

/**
 * Shape of telemetry events emitted whenever a command lifecycle completes.
 */
export interface CommandTelemetryEvent {
  readonly commandId: CommandId;
  readonly status: CommandTelemetryStatus;
  readonly requestedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly metadata: CommandMetadata;
  readonly error?: unknown;
}

/**
 * Callback signature for consumers interested in command telemetry (analytics, logging, etc.).
 */
export type CommandTelemetryHook = (event: CommandTelemetryEvent) => void | Promise<void>;

const telemetryHooks = new Set<CommandTelemetryHook>();

/**
 * Registers a telemetry hook. Returns a disposer that removes the hook when invoked.
 */
export const registerCommandTelemetryHook = (hook: CommandTelemetryHook): (() => void) => {
  telemetryHooks.add(hook);
  return () => telemetryHooks.delete(hook);
};

/**
 * Emits telemetry to all registered hooks. Hooks are awaited sequentially to maintain ordering
 * and simplify error handling. Failures are logged to the console and swallowed to avoid
 * breaking the command pipeline.
 */
export const emitCommandTelemetry = async (event: CommandTelemetryEvent): Promise<void> => {
  for (const hook of telemetryHooks) {
    try {
      await hook(event);
    } catch (error) {
      console.error('Command telemetry hook failed', error);
    }
  }
};

/**
 * Clears registered telemetry hooks. Exposed for testing to ensure isolation between suites.
 */
export const resetCommandTelemetryHooks = (): void => {
  telemetryHooks.clear();
};

/**
 * Base contract that all commands must satisfy. Implementations are expected to be
 * idempotent, with state mutations confined to the Valtio proxy supplied via context.
 */
export interface Command<TExecutePayload = void, TUndoPayload = void> {
  readonly metadata: CommandMetadata;

  preconditions?(
    context: CommandContext
  ): CommandPreconditionResult | Promise<CommandPreconditionResult>;

  execute(
    context: CommandContext
  ): CommandExecutionResult<TExecutePayload> | Promise<CommandExecutionResult<TExecutePayload>>;

  postCommit?(
    context: CommandContext,
    payload: TExecutePayload
  ): CommandUndoPayload<TUndoPayload> | Promise<CommandUndoPayload<TUndoPayload>>;
}

/**
 * Convenience base class offering default behaviour for optional lifecycle hooks.
 */
export abstract class CommandBase<TExecutePayload = void, TUndoPayload = void>
  implements Command<TExecutePayload, TUndoPayload>
{
  abstract readonly metadata: CommandMetadata;

  preconditions(
    _context: CommandContext
  ): CommandPreconditionResult | Promise<CommandPreconditionResult> {
    return { canExecute: true };
  }

  abstract execute(
    context: CommandContext
  ): CommandExecutionResult<TExecutePayload> | Promise<CommandExecutionResult<TExecutePayload>>;

  postCommit(
    _context: CommandContext,
    _payload: TExecutePayload
  ): CommandUndoPayload<TUndoPayload> | Promise<CommandUndoPayload<TUndoPayload>> {
    return undefined as CommandUndoPayload<TUndoPayload>;
  }
}

/**
 * Utility for constructing a fresh command context snapshot on demand. Primary consumers are
 * command dispatchers (HistoryManager, OperationService) that orchestrate lifecycle invocations.
 */
export const createCommandContext = (
  state: AppState,
  snapshot: AppStateSnapshot,
  container: ServiceContainer = ServiceContainer.getInstance()
): CommandContext => ({
  state,
  snapshot,
  container,
  requestedAt: Date.now(),
});

/**
 * Helper exposed for advanced scenarios needing a snapshot only. Provided for completeness so
 * callers that already have a proxy can avoid importing from `valtio` directly.
 */
export const snapshotState = (state: AppState): Snapshot<AppState> => snapshot(state as any);
