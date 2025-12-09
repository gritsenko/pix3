# Property Schema - Quick Reference

## For Node Class Authors

### Implement in Your Node Class

```typescript
static getPropertySchema(): PropertySchema {
  const baseSchema = NodeBase.getPropertySchema(); // or Node2D, Node3D, etc.

  return {
    nodeType: 'YourNodeType',
    extends: 'ParentNodeType',
    properties: [
      ...baseSchema.properties,
      // Add your properties here
    ],
    groups: {
      ...baseSchema.groups,
      // Define property groups
    },
  };
}
```

### Property Definition Template

```typescript
{
  name: 'propertyName',
  type: 'number',  // 'string' | 'number' | 'boolean' | 'vector2' | 'vector3'
  ui: {
    label: 'Display Name',
    group: 'CategoryName',
    description: 'What this does',
    step: 0.1,
    min: 0,
    max: 100,
    precision: 2,
    unit: '°',
    readOnly: false,
    hidden: false,
  },
  getValue: (node) => (node as YourNodeType).propertyName,
  setValue: (node, value) => {
    (node as YourNodeType).propertyName = Number(value);
  },
}
```

## Common Patterns

### Transform Property (2D Position)

```typescript
{
  name: 'position.x',
  type: 'number',
  ui: {
    label: 'X',
    group: 'Transform',
    step: 0.01,
    precision: 2,
  },
  getValue: (node) => (node as Node2D).position.x,
  setValue: (node, value) => { (node as Node2D).position.x = Number(value); },
}
```

### Rotation (Degrees)

```typescript
{
  name: 'rotation.z',
  type: 'number',
  ui: {
    label: 'Rotation',
    group: 'Transform',
    unit: '°',
    step: 0.1,
    precision: 1,
  },
  getValue: (node) => (node as Node2D).rotation.z * (180 / Math.PI),
  setValue: (node, value) => {
    (node as Node2D).rotation.z = Number(value) * (Math.PI / 180);
  },
}
```

### Boolean Property

```typescript
{
  name: 'visible',
  type: 'boolean',
  ui: {
    label: 'Visible',
    group: 'Display',
  },
  getValue: (node) => (node as NodeBase).visible,
  setValue: (node, value) => { (node as NodeBase).visible = Boolean(value); },
}
```

### String Property

```typescript
{
  name: 'texturePath',
  type: 'string',
  ui: {
    label: 'Texture',
    group: 'Rendering',
    description: 'Path to texture file',
  },
  getValue: (node) => (node as Sprite2D).texturePath ?? '',
  setValue: (node, value) => {
    // For read-only, leave empty or handle via command
  },
}
```

## Node Hierarchy

```
NodeBase
├── id (read-only)
├── name
└── type (read-only)

Node2D extends NodeBase
├── position.x, position.y
├── rotation.z (degrees)
├── scale.x, scale.y
└── ...inherited from NodeBase

Node3D extends NodeBase
├── position.x, position.y, position.z
├── rotation.x, rotation.y, rotation.z (degrees)
├── scale.x, scale.y, scale.z
└── ...inherited from NodeBase

Sprite2D extends Node2D
├── texturePath
└── ...inherited from Node2D

Group2D extends Node2D
├── width
├── height
└── ...inherited from Node2D
```

## Inspector Behavior

1. Inspector calls `getNodePropertySchema(primaryNode)`
2. Properties are grouped by `ui.group`
3. Groups are rendered in order: Base → others (alphabetical)
4. Each property renders based on `type`:
   - `'boolean'` → checkbox
   - `'number'` → number input with unit label
   - `'string'` → text input
5. User input → `UpdateObjectPropertyOperation` → OperationService
6. On error, UI reverts to previous value

## Tips

- Use `group` to organize related properties
- Set `precision` to control decimal display
- Use `unit` for clarity (°, px, ms, etc.)
- Mark important properties with `expanded: true` on groups
- Use `step` to control input granularity
- Read-only properties still appear for reference (set `readOnly: true`)
- Hide technical properties with `hidden: true`
