import { describe, expect, it, beforeEach, vi } from 'vitest';

import { HistoryManager, type HistorySnapshot } from './HistoryManager';

const createMockEntry = (label: string, callbacks?: { undo?: () => void; redo?: () => void }) => ({
	metadata: {
		label,
	},
	undo: callbacks?.undo ?? vi.fn(),
	redo: callbacks?.redo ?? vi.fn(),
});

describe('HistoryManager', () => {
	let manager: HistoryManager;

	beforeEach(() => {
		manager = new HistoryManager({ capacity: 3 });
	});

	it('pushes entries and enforces capacity', () => {
		manager.push(createMockEntry('first'));
		manager.push(createMockEntry('second'));
		manager.push(createMockEntry('third'));
		manager.push(createMockEntry('fourth'));

		const snapshot = manager.snapshot();
		expect(snapshot.undoEntries).toHaveLength(3);
		expect(snapshot.undoEntries[0]?.metadata.label).toBe('second');
		expect(snapshot.undoEntries[2]?.metadata.label).toBe('fourth');
		expect(manager.canRedo).toBe(false);
	});

	it('performs undo and redo while managing stacks', async () => {
		const undoSpy = vi.fn();
		const redoSpy = vi.fn();
		manager.push(createMockEntry('op', { undo: undoSpy, redo: redoSpy }));

		const undoResult = await manager.undo();
		expect(undoResult).toBe(true);
		expect(undoSpy).toHaveBeenCalledTimes(1);
		expect(manager.canUndo).toBe(false);
		expect(manager.canRedo).toBe(true);

		const redoResult = await manager.redo();
		expect(redoResult).toBe(true);
		expect(redoSpy).toHaveBeenCalledTimes(1);
		expect(manager.canUndo).toBe(true);
		expect(manager.canRedo).toBe(false);
	});

	it('restores stacks when undo or redo throws', async () => {
		const error = new Error('fail');
		manager.push(
			createMockEntry('unstable', {
				undo: () => {
					throw error;
				},
			}),
		);

		await expect(manager.undo()).rejects.toThrowError(error);
		const snapshot = manager.snapshot();
		expect(snapshot.undoEntries).toHaveLength(1);
		expect(snapshot.redoEntries).toHaveLength(0);
	});

	it('supports replacing the latest entry to enable coalescing', () => {
		manager.push(createMockEntry('initial'));
		manager.push(createMockEntry('replaceable'));

		manager.replaceLast(createMockEntry('replacement'));

		const snapshot = manager.snapshot();
		expect(snapshot.undoEntries).toHaveLength(2);
		expect(snapshot.undoEntries[1]?.metadata.label).toBe('replacement');
	});

	it('notifies subscribers with snapshots', () => {
		const listener = vi.fn();
		const unsubscribe = manager.subscribe(listener);

		expect(listener).toHaveBeenCalledTimes(1);
		expect((listener.mock.calls[0][0] as HistorySnapshot).undoEntries).toHaveLength(0);

		manager.push(createMockEntry('eventful'));
		expect(listener).toHaveBeenCalledTimes(2);

		unsubscribe();
		manager.push(createMockEntry('silent'));
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
