import { describe, expect, it, vi } from 'vitest';

import { AssetFileActivationService, type AssetActivation } from './AssetFileActivationService';

describe('AssetFileActivationService', () => {
  it('routes .pix3anim assets to an animation editor tab', async () => {
    const service = new AssetFileActivationService();
    const editorTabService = {
      focusOrOpenAnimation: vi.fn().mockResolvedValue(undefined),
    };

    Object.defineProperty(service, 'editorTabService', {
      value: editorTabService,
    });

    const payload: AssetActivation = {
      name: 'walk.pix3anim',
      path: 'assets/walk.pix3anim',
      kind: 'file',
      resourcePath: 'res://assets/walk.pix3anim',
      extension: 'pix3anim',
    };

    await service.handleActivation(payload);

    expect(editorTabService.focusOrOpenAnimation).toHaveBeenCalledWith(
      'res://assets/walk.pix3anim'
    );
  });
});
