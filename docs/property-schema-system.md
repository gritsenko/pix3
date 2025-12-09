# Property Schema System

## Overview

Pix3 now features a Godot-inspired property schema system that allows node classes to expose their editable properties to the object inspector. This enables dynamic, type-safe property editing without hardcoding each property in the inspector UI.

## Architecture

### Core Framework (`src/fw/property-schema.ts`)

The property schema framework defines:

- **PropertyDefinition** - Metadata for a single editable property including type, UI hints, validation, and getter/setter
- **PropertySchema** - Collection of property definitions for a node class, organized into groups
- **PropertyUIHints** - Display customization (label, unit, range, precision, etc.)
- **PropertyType** - Supported property types: string, number, boolean, vector2, vector3, enum, color, etc.

### Node Classes Integration

Each node class implements a static `getPropertySchema()` method:

```typescript
export class Node2D extends NodeBase {
  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'Node2D',
      extends: 'NodeBase',
      properties: [
        {
          name: 'position.x',
          type: 'number',
          ui: { label: 'X', group: 'Transform', step: 0.01 },
          getValue: (node) => (node as Node2D).position.x,
          setValue: (node, value) => { (node as Node2D).position.x = Number(value); },
        },
        // ... more properties
      ],
      groups: { Transform: { label: 'Transform', expanded: true } },
    };
  }
}
```

### Node Hierarchy

Schemas follow the class hierarchy and can extend parent schemas:

- **NodeBase** → Base properties (id, name, type)
- **Node2D** → Extends NodeBase + 2D transforms (position.x/y, rotation.z, scale.x/y)
- **Node3D** → Extends NodeBase + 3D transforms (position.x/y/z, rotation.x/y/z, scale.x/y/z)
- **Sprite2D** → Extends Node2D + sprite-specific (texturePath)
- **Group2D** → Extends Node2D + group-specific (width, height)

## Usage in Inspector

The `InspectorPanel` component uses the property schema system to:

1. **Dynamically generate UI** - No hardcoded property inputs
2. **Organize properties by group** - Automatic sectioning by category
3. **Respect UI hints** - Apply labels, units, validation rules
4. **Handle type conversions** - Degrees ↔ radians, etc.
5. **Validate input** - Real-time validation with error feedback

### Example: Editing a Sprite2D

When you select a Sprite2D node:

1. Inspector calls `getNodePropertySchema(node)`
2. Schema is retrieved with Base, Transform, and Sprite groups
3. Properties are grouped and rendered dynamically
4. User edits create `UpdateObjectPropertyOperation` objects
5. Operations are pushed through the OperationService

## Property Definition Reference

### Core Structure

```typescript
interface PropertyDefinition {
  name: string;           // Property key (e.g., "position.x")
  type: PropertyType;     // Data type
  ui?: PropertyUIHints;   // Display settings
  validation?: PropertyValidation;
  defaultValue?: unknown;
  getValue: (node) => unknown;    // Read from node
  setValue: (node, value) => void; // Write to node
}
```

### UI Hints

```typescript
interface PropertyUIHints {
  label?: string;        // Display name
  description?: string;  // Tooltip
  group?: string;        // Category name
  min?: number;          // Numeric range
  max?: number;
  step?: number;         // Input increment
  unit?: string;         // Suffix (e.g., "°", "px")
  options?: string[] | Record<string, unknown>; // For enum
  precision?: number;    // Decimal places
  slider?: boolean;      // Render as slider
  hidden?: boolean;      // Hide from inspector
  readOnly?: boolean;    // Disable editing
}
```

## Adding Properties to Custom Nodes

When creating a new node class, implement `getPropertySchema()`:

```typescript
export interface CustomNodeProps extends Node2DProps {
  color?: string;
  speed?: number;
}

export class CustomNode extends Node2D {
  color: string;
  speed: number;

  constructor(props: CustomNodeProps) {
    super(props, 'CustomNode');
    this.color = props.color ?? '#ffffff';
    this.speed = props.speed ?? 1.0;
  }

  static getPropertySchema(): PropertySchema {
    const baseSchema = Node2D.getPropertySchema();

    return {
      nodeType: 'CustomNode',
      extends: 'Node2D',
      properties: [
        ...baseSchema.properties,
        {
          name: 'color',
          type: 'string',
          ui: {
            label: 'Color',
            group: 'Appearance',
            colorFormat: 'hex',
          },
          getValue: (node) => (node as CustomNode).color,
          setValue: (node, value) => { (node as CustomNode).color = String(value); },
        },
        {
          name: 'speed',
          type: 'number',
          ui: {
            label: 'Speed',
            group: 'Behavior',
            min: 0,
            max: 10,
            step: 0.1,
            precision: 1,
          },
          getValue: (node) => (node as CustomNode).speed,
          setValue: (node, value) => { (node as CustomNode).speed = Number(value); },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Appearance: { label: 'Appearance', expanded: true },
        Behavior: { label: 'Behavior', expanded: false },
      },
    };
  }
}
```

## Utility Functions (`src/fw/property-schema-utils.ts`)

### `getNodePropertySchema(node)`

Dynamically retrieve the schema for any node instance.

### `getPropertiesByGroup(schema)`

Group properties by category, returning a Map of group names to property arrays.

### `getPropertyDisplayValue(node, prop)`

Get formatted display value for a property, handling type conversions.

### `validatePropertyValue(prop, value)`

Validate and optionally transform a value before setting.

### `setNodePropertyValue(node, prop, value)`

Set a property with validation and transformation.

## Benefits

1. **Single Source of Truth** - Property metadata defined once in each class
2. **Type Safety** - TypeScript interfaces ensure correctness
3. **Extensibility** - Easy to add new properties or UI hints
4. **Consistency** - All nodes follow the same pattern
5. **Maintainability** - No scattered property definitions
6. **Godot-Like** - Familiar paradigm for designers/developers
7. **Dynamic UI** - Inspector adapts automatically to node types

## Future Enhancements

- Range sliders for numeric values
- Color picker for color properties
- Dropdown selects for enum properties
- Nested object/component editors
- Property animation curves
- Undo/redo per property change
- Property search/filtering
- Custom property editors via plugins
