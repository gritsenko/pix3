/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest';

import { FocusRingService } from './FocusRingService';

const flushMicrotasks = async () => {
	await Promise.resolve();
};

describe('FocusRingService', () => {
	it('assigns roving tab indexes and handles arrow navigation', async () => {
		const host = document.createElement('div');
		host.setAttribute('role', 'toolbar');

		const items: HTMLElement[] = [];
		for (let index = 0; index < 3; index += 1) {
			const item = document.createElement('div');
			item.className = 'tool';
			item.textContent = `Item ${index + 1}`;
			item.setAttribute('role', 'button');
			host.append(item);
			items.push(item);
		}

		document.body.append(host);

		const service = new FocusRingService();
		const dispose = service.attachRovingFocus(host, {
			selector: '.tool',
		});

		await flushMicrotasks();

		expect(items[0].tabIndex).toBe(0);
		expect(items[1].tabIndex).toBe(-1);
		expect(items[2].tabIndex).toBe(-1);

		items[0].focus();
		items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await flushMicrotasks();

		expect(document.activeElement).toBe(items[1]);
		expect(items[1].tabIndex).toBe(0);
		expect(items[0].tabIndex).toBe(-1);

		// Mark middle item as disabled and ensure it becomes unfocusable.
		items[1].setAttribute('disabled', 'true');
		await flushMicrotasks();
		items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await flushMicrotasks();

		expect(document.activeElement).toBe(items[2]);
		expect(items[2].tabIndex).toBe(0);
		expect(items[1].tabIndex).toBe(-1);

		dispose();
		host.remove();
	});
});