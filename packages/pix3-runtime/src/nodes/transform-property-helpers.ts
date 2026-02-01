import {
  defineProperty,
  type PropertyDefinition,
  type PropertyUIHints,
} from '../fw/property-schema';
import type { Node2D } from './Node2D';
import type { Node3D } from './Node3D';

export function createVector2PositionProperty(uiHints: PropertyUIHints = {}): PropertyDefinition {
  return defineProperty('position', 'vector2', {
    ui: { label: 'Position', group: 'Transform', step: 0.01, precision: 2, ...uiHints },
    getValue: (node: unknown) => {
      const n = node as Node2D;
      return { x: n.position.x, y: n.position.y };
    },
    setValue: (node: unknown, value: unknown) => {
      const n = node as Node2D;
      const v = value as { x: number; y: number };
      n.position.x = v.x;
      n.position.y = v.y;
    },
  });
}

export function createVector3PositionProperty(uiHints: PropertyUIHints = {}): PropertyDefinition {
  return defineProperty('position', 'vector3', {
    ui: { label: 'Position', group: 'Transform', step: 0.01, precision: 2, ...uiHints },
    getValue: (node: unknown) => {
      const n = node as Node3D;
      return { x: n.position.x, y: n.position.y, z: n.position.z };
    },
    setValue: (node: unknown, value: unknown) => {
      const n = node as Node3D;
      const v = value as { x: number; y: number; z: number };
      n.position.x = v.x;
      n.position.y = v.y;
      n.position.z = v.z;
    },
  });
}

export function createVector2ScaleProperty(uiHints: PropertyUIHints = {}): PropertyDefinition {
  return defineProperty('scale', 'vector2', {
    ui: { label: 'Scale', group: 'Transform', step: 0.01, precision: 2, min: 0, ...uiHints },
    getValue: (node: unknown) => {
      const n = node as Node2D;
      return { x: n.scale.x, y: n.scale.y };
    },
    setValue: (node: unknown, value: unknown) => {
      const n = node as Node2D;
      const v = value as { x: number; y: number };
      n.scale.x = v.x;
      n.scale.y = v.y;
    },
  });
}

export function createVector3ScaleProperty(uiHints: PropertyUIHints = {}): PropertyDefinition {
  return defineProperty('scale', 'vector3', {
    ui: { label: 'Scale', group: 'Transform', step: 0.01, precision: 2, min: 0, ...uiHints },
    getValue: (node: unknown) => {
      const n = node as Node3D;
      return { x: n.scale.x, y: n.scale.y, z: n.scale.z };
    },
    setValue: (node: unknown, value: unknown) => {
      const n = node as Node3D;
      const v = value as { x: number; y: number; z: number };
      n.scale.x = v.x;
      n.scale.y = v.y;
      n.scale.z = v.z;
    },
  });
}

export function createNumberRotationProperty2D(uiHints: PropertyUIHints = {}): PropertyDefinition {
  return defineProperty('rotation', 'number', {
    ui: {
      label: 'Rotation',
      description: 'Z-axis rotation',
      group: 'Transform',
      step: 0.1,
      precision: 1,
      unit: '°',
      ...uiHints,
    },
    getValue: (node: unknown) => {
      const n = node as Node2D;
      return n.rotation.z * (180 / Math.PI);
    },
    setValue: (node: unknown, value: unknown) => {
      const n = node as Node2D;
      n.rotation.z = Number(value) * (Math.PI / 180);
    },
  });
}

export function createEulerRotationProperty3D(uiHints: PropertyUIHints = {}): PropertyDefinition {
  return defineProperty('rotation', 'euler', {
    ui: { label: 'Rotation', group: 'Transform', step: 0.1, precision: 1, unit: '°', ...uiHints },
    getValue: (node: unknown) => {
      const n = node as Node3D;
      return {
        x: n.rotation.x * (180 / Math.PI),
        y: n.rotation.y * (180 / Math.PI),
        z: n.rotation.z * (180 / Math.PI),
      };
    },
    setValue: (node: unknown, value: unknown) => {
      const n = node as Node3D;
      const v = value as { x: number; y: number; z: number };
      n.rotation.x = v.x * (Math.PI / 180);
      n.rotation.y = v.y * (Math.PI / 180);
      n.rotation.z = v.z * (Math.PI / 180);
    },
  });
}
