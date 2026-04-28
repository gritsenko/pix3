import { afterEach, describe, expect, it } from 'vitest';

import './property-editors';

import { AnimationResourceEditor } from './property-editors';

describe('AnimationResourceEditor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('emits create-request when the create button is clicked for an empty animation slot', async () => {
    const editor = document.createElement(
      'pix3-animation-resource-editor'
    ) as AnimationResourceEditor;
    editor.showCreateButton = true;
    editor.resourceUrl = '';

    const onCreateRequest = new Promise<void>(resolve => {
      editor.addEventListener('create-request', () => resolve(), { once: true });
    });

    document.body.appendChild(editor);
    await editor.updateComplete;

    const button = editor.shadowRoot?.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Expected create button to be rendered');
    }

    button.click();

    await onCreateRequest;
  });

  it('emits open-request when the assigned animation asset is double-clicked', async () => {
    const editor = document.createElement(
      'pix3-animation-resource-editor'
    ) as AnimationResourceEditor;
    editor.resourceUrl = 'res://animations/walk.pix3anim';

    const onOpenRequest = new Promise<CustomEvent<{ url: string }>>(resolve => {
      editor.addEventListener('open-request', event => resolve(event as CustomEvent<{ url: string }>), {
        once: true,
      });
    });

    document.body.appendChild(editor);
    await editor.updateComplete;

    const input = editor.shadowRoot?.querySelector('input[type="text"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected animation resource input to be rendered');
    }

    input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));

    const event = await onOpenRequest;
    expect(event.detail.url).toBe('res://animations/walk.pix3anim');
  });
});