import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from 'valtio/vanilla';

import { OperationService } from './OperationService';
import { HistoryManager } from '../history';
import { OperationBase, type OperationContext, type OperationInvokeResult } from './Operation';
import { createInitialAppState, type AppState } from '../../state';

class SelectNodeOperation extends OperationBase {
	readonly metadata = {
		id: 'selection.select-node',
		title: 'Select Node',
		description: 'Adds a node to the current selection',
	};

	private readonly nodeId: string;

	constructor(nodeId: string) {
		super();
		this.nodeId = nodeId;
	}

	perform(context: OperationContext): OperationInvokeResult {
		if (context.state.selection.nodeIds.includes(this.nodeId)) {
			return { didMutate: false };
		}

		context.state.selection.nodeIds.push(this.nodeId);

		return {
			didMutate: true,
			commit: {
				label: `Select ${this.nodeId}`,
				undo: () => {
					const index = context.state.selection.nodeIds.indexOf(this.nodeId);
					if (index >= 0) {
						context.state.selection.nodeIds.splice(index, 1);
					}
				},
				redo: () => {
					if (!context.state.selection.nodeIds.includes(this.nodeId)) {
						context.state.selection.nodeIds.push(this.nodeId);
					}
				},
			},
		};
	}
}

class SetProjectNameOperation extends OperationBase {
	readonly metadata = {
		id: 'project.set-name',
		title: 'Set Project Name',
	};

	private readonly nextName: string;

	constructor(nextName: string) {
		super();
		this.nextName = nextName;
	}

	perform(context: OperationContext): OperationInvokeResult {
		if (context.state.project.projectName === this.nextName) {
			return { didMutate: false };
		}

		const previous = context.state.project.projectName;
		context.state.project.projectName = this.nextName;

		return {
			didMutate: true,
			commit: {
				label: 'Update Project Name',
				undo: () => {
					context.state.project.projectName = previous;
				},
				redo: () => {
					context.state.project.projectName = this.nextName;
				},
			},
		};
	}
}

class ThrowingOperation extends OperationBase {
	readonly metadata = {
		id: 'test.throwing',
		title: 'Throwing Operation',
	};

	perform(): OperationInvokeResult {
		throw new Error('boom');
	}
}

describe('OperationService', () => {
	let state: AppState;
	let service: OperationService;
	let history: HistoryManager;

	beforeEach(() => {
		state = proxy(createInitialAppState());
		history = new HistoryManager();
		service = new OperationService(history, state);
	});

	it('invokes operations and pushes them to history', async () => {
		const events: string[] = [];
		service.addListener((event) => events.push(event.type));

		const didPush = await service.invokeAndPush(new SelectNodeOperation('node-1'));

		expect(didPush).toBe(true);
		expect(state.selection.nodeIds).toEqual(['node-1']);
		expect(history.canUndo).toBe(true);
		expect(state.operations.lastUndoableCommandId).toBe('selection.select-node');
		expect(events).toEqual([
			'operation:invoked',
			'history:changed',
			'operation:completed',
		]);
	});

	it('performs undo and redo, emitting events and mutating state', async () => {
		await service.invokeAndPush(new SelectNodeOperation('node-2'));

		const eventListener = vi.fn();
		service.addListener(eventListener);

		const undoResult = await service.undo();
		expect(undoResult).toBe(true);
		expect(state.selection.nodeIds).toEqual([]);
		expect(state.operations.lastUndoableCommandId).toBeNull();
		expect(eventListener).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'operation:undone' }),
		);

		const redoResult = await service.redo();
		expect(redoResult).toBe(true);
		expect(state.selection.nodeIds).toEqual(['node-2']);
		expect(eventListener).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'operation:redone' }),
		);
	});

	it('coalesces history entries when coalesce keys match', async () => {
		await service.invokeAndPush(new SetProjectNameOperation('Pix 3'), {
			coalesceKey: 'project.rename',
		});
		await service.invokeAndPush(new SetProjectNameOperation('Pix 3 Deluxe'), {
			coalesceKey: 'project.rename',
		});

		const snapshot = history.snapshot();
		expect(snapshot.undoEntries).toHaveLength(1);
		expect(snapshot.undoEntries[0]?.metadata.label).toBe('Update Project Name');
		expect(state.project.projectName).toBe('Pix 3 Deluxe');
	});

	it('supports non-undoable operations via invoke', async () => {
		const result = await service.invoke(new SelectNodeOperation('node-3'));
		expect(result.didMutate).toBe(true);
		expect(result.commit).toBeDefined();
		expect(history.canUndo).toBe(false);
	});

	it('resets execution flags when an operation throws', async () => {
		await expect(service.invoke(new ThrowingOperation())).rejects.toThrow('boom');
		expect(state.operations.isExecuting).toBe(false);
		expect(state.operations.pendingCommandCount).toBe(0);
	});
});
