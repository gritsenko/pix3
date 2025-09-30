/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceContainer } from '../../fw/di';
import { ViewportRendererService } from '../../core/rendering/ViewportRendererService';
import '../../fw'; // ensure fw exports are available
import { ViewportPanel } from './viewport-panel';

describe('ViewportPanel resize integration', () => {
  let originalRO: typeof ResizeObserver | undefined;

  beforeEach(() => {
    // Mock ResizeObserver to call callback immediately with a fake contentRect
    originalRO = (global as any).ResizeObserver;

    (global as any).ResizeObserver = class {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(_target: Element) {
        // simulate an immediate resize measurement
        const entry = {
          target: _target,
          contentRect: { width: 320, height: 240, x: 0, y: 0, top: 0, left: 0, bottom: 240, right: 320 } as DOMRect,
        } as unknown as ResizeObserverEntry;
        this.cb([entry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    } as any;
    // Register a stub renderer service in the DI container so @inject returns it
    const container = ServiceContainer.getInstance();
    class StubRenderer {
      initialize = vi.fn();
      resize = vi.fn();
      setSceneGraph = vi.fn();
      hasActiveSceneGraph = vi.fn(() => false);
      dispose = vi.fn();
      setTransformMode = vi.fn();
      getTransformMode = vi.fn(() => 'translate');
    }
    // Register the stub under the ViewportRendererService token so the @inject(ViewportRendererService)
    // decorator resolves to our stub instead of the real renderer that creates a WebGL context.
    const token = container.getOrCreateToken(ViewportRendererService);
    container.addService(token, StubRenderer, 'singleton');
  });

  afterEach(() => {
    (global as any).ResizeObserver = originalRO;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('calls renderer.resize when host is observed', async () => {
    const el = document.createElement('pix3-viewport-panel') as unknown as ViewportPanel;

    // Attach element to DOM and wait for Lit render lifecycle
    document.body.appendChild(el);
    // Wait for the element to finish its update/render cycle so firstUpdated runs
    if ((el as any).updateComplete) {
      await (el as any).updateComplete;
    }

    // Retrieve DI-provided stub instance and assert resize called
    const token2 = ServiceContainer.getInstance().getOrCreateToken(ViewportRendererService);
    const instance = ServiceContainer.getInstance().getService<any>(token2);
    expect(instance.resize).toHaveBeenCalled();
    // Check it was called with numbers matching the mocked contentRect
    const call = instance.resize.mock.calls[0];
    expect(call[0]).toBeGreaterThan(0);
    expect(call[1]).toBeGreaterThan(0);
  });
});
