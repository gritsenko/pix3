import { describe, expect, it } from 'vitest';
import {
  AmbientLightNode,
  AudioPlayer,
  Camera3D,
  DirectionalLightNode,
  HemisphereLightNode,
  PointLightNode,
  SpotLightNode,
} from '@pix3/runtime';

import { getNodeVisuals } from './node-visuals.helper';

describe('getNodeVisuals', () => {
  it.each([
    ['DirectionalLightNode', new DirectionalLightNode({ name: 'Directional Light' })],
    ['PointLightNode', new PointLightNode({ name: 'Point Light' })],
    ['SpotLightNode', new SpotLightNode({ name: 'Spot Light' })],
    ['AmbientLightNode', new AmbientLightNode({ name: 'Ambient Light' })],
    ['HemisphereLightNode', new HemisphereLightNode({ name: 'Hemisphere Light' })],
  ])('returns sun icon for %s', (_label, node) => {
    expect(getNodeVisuals(node)).toEqual({
      color: '#fe9ebeff',
      icon: 'sun',
    });
  });

  it('keeps existing camera visuals unchanged', () => {
    expect(getNodeVisuals(new Camera3D({ name: 'Camera' }))).toEqual({
      color: '#fe9ebeff',
      icon: 'camera',
    });
  });

  it('keeps existing audio visuals unchanged', () => {
    expect(getNodeVisuals(new AudioPlayer({ name: 'Audio Player' }))).toEqual({
      color: '#7fd1b9ff',
      icon: 'volume-2',
    });
  });
});
