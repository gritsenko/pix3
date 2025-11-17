import { vi, describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { ViewportRendererService } from './ViewportRenderService';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { Vector2 } from 'three';

describe('ViewportRendererService', () => {
  it('should use ResourceManager.readBlob for templ:// sprite textures', async () => {
    const service = new ViewportRendererService();

    // Create a fake resource manager
    const readBlobSpy = vi.fn().mockResolvedValue(new Blob(["fake"]));
    Object.defineProperty(service, 'resourceManager', {
      value: { readBlob: readBlobSpy },
      configurable: true,
    });

    // Minimal stubs for dependencies used by createSprite2DVisual
    (service as any).scene = { add: vi.fn() } as any;

    // Create a sprite with templ scheme
    const sprite = new Sprite2D({ id: 'test-sprite', texturePath: 'templ://pix3-logo.png' });

    // Call private method reflectively
    const mesh = (service as any).createSprite2DVisual(sprite);

    expect(mesh).toBeDefined();

    // Wait a tick for the async fetch to be invoked
    await Promise.resolve();

    expect(readBlobSpy).toHaveBeenCalledWith('templ://pix3-logo.png');
  });

  it('should not attempt direct load for templ:// when readBlob fails', async () => {
    const service = new ViewportRendererService();

    // readBlob rejects to simulate missing mapping
    const readBlobSpy = vi.fn().mockRejectedValue(new Error('Not found'));
    Object.defineProperty(service, 'resourceManager', {
      value: { readBlob: readBlobSpy },
      configurable: true,
    });

    // stub the TextureLoader to observe direct load attempts
    const loadSpy = vi.fn();
    vi.spyOn((THREE as any).TextureLoader.prototype, 'load').mockImplementation(loadSpy);

    (service as any).scene = { add: vi.fn() } as any;

    const sprite = new Sprite2D({ id: 'test-sprite-2', texturePath: 'templ://pix3-logo.png' });
    (service as any).createSprite2DVisual(sprite);

    // Wait a tick to run async failure handler
    await Promise.resolve();

    // Ensure direct loader wasn't invoked for templ:// fallback
    expect(loadSpy).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
