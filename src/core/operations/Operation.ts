import {
	createCommandContext,
	snapshotState,
	type CommandContext as CommandContextType,
} from '../commands/command';
import { ServiceContainer } from '../../fw/di';
import {
	appState,
	getAppStateSnapshot,
	type AppState,
	type AppStateSnapshot,
} from '../../state';

export type OperationContext = CommandContextType;

export interface OperationMetadata {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly affectsNodeStructure?: boolean;
	readonly tags?: readonly string[];
	readonly coalesceKey?: string;
}

export interface OperationCommit {
	readonly label?: string;
	readonly beforeSnapshot?: AppStateSnapshot;
	readonly afterSnapshot?: AppStateSnapshot;
	undo(): Promise<void> | void;
	redo(): Promise<void> | void;
}

export interface OperationInvokeResult {
	readonly didMutate: boolean;
	readonly commit?: OperationCommit;
}

export interface OperationInvokeOptions {
	readonly context?: Partial<OperationContext>;
	readonly label?: string;
	readonly coalesceKey?: string;
	readonly beforeSnapshot?: AppStateSnapshot;
	readonly afterSnapshot?: AppStateSnapshot;
}

export interface Operation<TInvokeResult extends OperationInvokeResult = OperationInvokeResult> {
	readonly metadata: OperationMetadata;
	perform(context: OperationContext): TInvokeResult | Promise<TInvokeResult>;
}

export abstract class OperationBase<
	TInvokeResult extends OperationInvokeResult = OperationInvokeResult,
> implements Operation<TInvokeResult>
{
	abstract readonly metadata: OperationMetadata;

	abstract perform(context: OperationContext): TInvokeResult | Promise<TInvokeResult>;
}

export const createOperationContext = (
	state: AppState = appState,
	snapshot: AppStateSnapshot = getAppStateSnapshot(),
	container: ServiceContainer = ServiceContainer.getInstance(),
): OperationContext =>
	createCommandContext(state, snapshot, container);

export const snapshotOperationState = (state: AppState): AppStateSnapshot =>
	snapshotState(state);
