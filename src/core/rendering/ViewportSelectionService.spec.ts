import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Object3D, PerspectiveCamera } from 'three';

import { ViewportSelectionService } from './ViewportSelectionService';

vi.mock('../commands/SelectObjectCommand', () => {
	const execute = vi.fn().mockReturnValue({ didMutate: false, payload: undefined });
	const postCommit = vi.fn();
	const SelectObjectCommand = vi.fn().mockImplementation(() => ({
		execute,
		postCommit,
	}));

	return {
		SelectObjectCommand,
		createSelectObjectCommand: vi.fn(),
		selectObject: vi.fn(),
		toggleObjectSelection: vi.fn(),
		selectObjectRange: vi.fn(),
	} as unknown as typeof import('../commands/SelectObjectCommand');
});

import { SelectObjectCommand } from '../commands/SelectObjectCommand';

const setPrivate = <TValue>(instance: object, key: string, value: TValue): void => {
	(instance as unknown as Record<string, unknown>)[key] = value;
};

const getPrivate = <TValue>(instance: object, key: string): TValue => {
	return (instance as unknown as Record<string, unknown>)[key] as TValue;
};

const createViewportService = () => {
	const service = new ViewportSelectionService();
	const canvas = document.createElement('canvas');

	vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
		x: 0,
		y: 0,
		top: 0,
		left: 0,
		bottom: 100,
		right: 100,
		width: 100,
		height: 100,
		toJSON: () => ({}),
	});

	const camera = new PerspectiveCamera();
	const sceneContentRoot = new Object3D();

	setPrivate(service, 'canvas', canvas);
	setPrivate(service, 'camera', camera);
	setPrivate(service, 'sceneContentRoot', sceneContentRoot);

	return { service, canvas };
};

describe('ViewportSelectionService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ignores click events triggered immediately after a gizmo drag', async () => {
		const { service } = createViewportService();

			setPrivate(service, 'suppressClickUntil', Date.now() + 5_000);

			const handleClick = getPrivate<(event: MouseEvent) => Promise<void>>(service, 'handleClick');
			await handleClick(new MouseEvent('click', { clientX: 50, clientY: 50 }));

		expect(SelectObjectCommand).not.toHaveBeenCalled();
			const suppressionAfterIgnoredClick = getPrivate<number | undefined>(service, 'suppressClickUntil');
				expect(suppressionAfterIgnoredClick).toBe(0);
	});

	it('allows selection once the suppression window has elapsed', async () => {
		const { service } = createViewportService();

			setPrivate(service, 'suppressClickUntil', Date.now() - 5_000);

			const handleClick = getPrivate<(event: MouseEvent) => Promise<void>>(service, 'handleClick');
			await handleClick(new MouseEvent('click', { clientX: 50, clientY: 50 }));

		expect(SelectObjectCommand).toHaveBeenCalledTimes(1);
			const suppressionAfterValidClick = getPrivate<number | undefined>(service, 'suppressClickUntil');
				expect(suppressionAfterValidClick).toBe(0);
	});
});
