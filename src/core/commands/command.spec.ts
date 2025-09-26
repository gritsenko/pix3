import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createCommandContext,
	emitCommandTelemetry,
	registerCommandTelemetryHook,
	resetCommandTelemetryHooks,
	snapshotState,
	type CommandMetadata,
} from './command';
import { createInitialAppState, type AppState, type AppStateSnapshot } from '../../state';
import { ServiceContainer } from '../../fw/di';
import { proxy, snapshot } from 'valtio/vanilla';

describe('command telemetry hooks', () => {
	const metadata: CommandMetadata = {
		id: 'test.command',
		title: 'Test Command',
		description: 'Validates telemetry wiring',
	};

	beforeEach(() => {
		resetCommandTelemetryHooks();
	});

	it('emits telemetry events to registered hooks', async () => {
		const hook = vi.fn();
		registerCommandTelemetryHook(hook);

		const event = {
			commandId: metadata.id,
			status: 'executed' as const,
			requestedAt: 0,
			completedAt: 10,
			durationMs: 10,
			metadata,
		};

		await emitCommandTelemetry(event);

		expect(hook).toHaveBeenCalledTimes(1);
		expect(hook).toHaveBeenCalledWith(event);
	});

	it('disposer removes telemetry hooks', async () => {
		const hook = vi.fn();
		const dispose = registerCommandTelemetryHook(hook);

		dispose();

		await emitCommandTelemetry({
			commandId: metadata.id,
			status: 'executed',
			requestedAt: 0,
			completedAt: 0,
			durationMs: 0,
			metadata,
		});

		expect(hook).not.toHaveBeenCalled();
	});

	it('swallows hook errors while logging them', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const failingHook = vi.fn().mockImplementation(() => {
			throw new Error('nope');
		});
		const succeedingHook = vi.fn();

		registerCommandTelemetryHook(failingHook);
		registerCommandTelemetryHook(succeedingHook);

		await emitCommandTelemetry({
			commandId: metadata.id,
			status: 'executed',
			requestedAt: 0,
			completedAt: 1,
			durationMs: 1,
			metadata,
		});

		expect(consoleSpy).toHaveBeenCalled();
		expect(succeedingHook).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});
});

describe('command context helpers', () => {
	beforeEach(() => {
		resetCommandTelemetryHooks();
	});

	it('creates a command context with default container', () => {
		const stateProxy = proxy<AppState>(createInitialAppState());
		const stateSnapshot: AppStateSnapshot = snapshot(stateProxy);
		const context = createCommandContext(
			stateProxy,
			stateSnapshot,
			ServiceContainer.getInstance(),
		);

		expect(context.state).toBe(stateProxy);
		expect(context.snapshot).toBe(stateSnapshot);
		expect(context.container).toBe(ServiceContainer.getInstance());
		expect(typeof context.requestedAt).toBe('number');
	});

	it('wraps valtio proxy snapshot helper', () => {
		const stateProxy = proxy<AppState>(createInitialAppState());
		const directSnapshot = snapshot(stateProxy);
		const helperSnapshot = snapshotState(stateProxy);

		expect(helperSnapshot).toMatchObject({ project: directSnapshot.project });
		expect(helperSnapshot.scenes).toEqual(directSnapshot.scenes);
	});
});
