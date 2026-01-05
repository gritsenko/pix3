import {
  defineProperty,
  type PropertyDefinition,
  type PropertyUIHints,
} from '@/fw/property-schema';

export function createLightColorProperty<
  T extends {
    light: {
      color: {
        getHexString: () => string;
        set: (v: unknown) => void;
        convertSRGBToLinear: () => unknown;
      };
    };
  },
>(uiHints: PropertyUIHints = {}): PropertyDefinition {
  return defineProperty('color', 'color', {
    ui: { label: 'Color', group: 'Light', ...uiHints },
    getValue: (n: unknown) => '#' + (n as T).light.color.getHexString(),
    setValue: (n: unknown, v: unknown) => {
      const color = (n as T).light.color;
      color.set(String(v));
      color.convertSRGBToLinear();
    },
  });
}

export function createLightIntensityProperty<T extends { light: { intensity: number } }>(
  uiHints: PropertyUIHints = {}
): PropertyDefinition {
  return defineProperty('intensity', 'number', {
    ui: { label: 'Intensity', group: 'Light', step: 0.1, precision: 2, ...uiHints },
    getValue: (n: unknown) => (n as T).light.intensity,
    setValue: (n: unknown, v: unknown) => {
      (n as T).light.intensity = Number(v);
    },
  });
}

export function createCastShadowProperty<T extends { light: { castShadow: boolean } }>(
  uiHints: PropertyUIHints = {}
): PropertyDefinition {
  return defineProperty('castShadow', 'boolean', {
    ui: { label: 'Cast Shadow', group: 'Light', ...uiHints },
    getValue: (n: unknown) => (n as T).light.castShadow,
    setValue: (n: unknown, v: unknown) => {
      (n as T).light.castShadow = Boolean(v);
    },
  });
}

export function createLightDistanceProperty<T extends { light: { distance: number } }>(
  uiHints: PropertyUIHints = {}
): PropertyDefinition {
  return defineProperty('distance', 'number', {
    ui: { label: 'Range', group: 'Light', step: 0.1, precision: 2, ...uiHints },
    getValue: (n: unknown) => (n as T).light.distance,
    setValue: (n: unknown, v: unknown) => {
      (n as T).light.distance = Number(v);
    },
  });
}

export function createLightDecayProperty<T extends { light: { decay: number } }>(
  uiHints: PropertyUIHints = {}
): PropertyDefinition {
  return defineProperty('decay', 'number', {
    ui: { label: 'Decay', group: 'Light', step: 0.1, precision: 2, ...uiHints },
    getValue: (n: unknown) => (n as T).light.decay,
    setValue: (n: unknown, v: unknown) => {
      (n as T).light.decay = Number(v);
    },
  });
}
