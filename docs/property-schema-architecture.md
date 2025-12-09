# Property Schema Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Object Inspector (inspector-panel.ts)                        │
│ - Gets schema from node                                      │
│ - Renders properties dynamically                             │
│ - Handles user input                                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ uses
                 ↓
┌─────────────────────────────────────────────────────────────┐
│ Property Schema Utilities (property-schema-utils.ts)         │
│ - getNodePropertySchema()                                    │
│ - getPropertiesByGroup()                                     │
│ - getPropertyDisplayValue()                                  │
│ - validatePropertyValue()                                    │
│ - setNodePropertyValue()                                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ reads/uses
                 ↓
┌─────────────────────────────────────────────────────────────┐
│ Property Schema Framework (property-schema.ts)               │
│ - PropertyDefinition                                         │
│ - PropertySchema                                             │
│ - PropertyUIHints                                            │
│ - PropertyType                                               │
│ - PropertyValidation                                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ implemented by
                 ↓
┌─────────────────────────────────────────────────────────────┐
│ Node Classes (NodeBase.ts, Node2D.ts, Node3D.ts, etc.)      │
│ - static getPropertySchema(): PropertySchema                │
│ - Defines all editable properties for each node type        │
│ - Includes getValue/setValue methods                         │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow: User Edits a Property

```
User Input
   │
   ↓
Inspector Component
   │
   ├─ handlePropertyInput()
   │  └─ Updates local UI state
   │
   └─ handlePropertyBlur()
      │
      ├─ Validates value
      │
      ├─ applyPropertyChange()
      │  │
      │  └─ Creates UpdateObjectPropertyOperation
      │     │
      │     └─ OperationService.invokeAndPush()
      │        │
      │        ├─ Operation.perform()
      │        │  │
      │        │  └─ PropertyDefinition.setValue()
      │        │     │
      │        │     └─ Modifies node instance
      │        │
      │        └─ Pushes to history
      │
      └─ syncValuesFromNode()
         │
         └─ Refreshes UI from node state
            (via PropertyDefinition.getValue())
```

## Schema Hierarchy

```
NodeBase
├── nodeId (read-only)
├── name
└── type (read-only)
    Group: "Base Properties"

Node2D extends NodeBase
├── ...inherited
├── position.x
├── position.y
├── rotation.z (degrees)
├── scale.x
└── scale.y
    Group: "Transform"

Node3D extends NodeBase
├── ...inherited
├── position.x, y, z
├── rotation.x, y, z (degrees)
├── scale.x, y, z
    Group: "Transform"

Sprite2D extends Node2D
├── ...inherited from Node2D
└── texturePath
    Group: "Sprite"

Group2D extends Node2D
├── ...inherited from Node2D
├── width
└── height
    Group: "Size"
```

## Property Definition Structure

```
PropertyDefinition {
  name: string
    ↓
  type: PropertyType
    ├─ 'string'
    ├─ 'number'
    ├─ 'boolean'
    ├─ 'vector2'
    ├─ 'vector3'
    ├─ 'color'
    ├─ 'enum'
    └─ 'object'
    ↓
  ui?: PropertyUIHints
    ├─ label: string
    ├─ description: string
    ├─ group: string
    ├─ min/max: number
    ├─ step: number
    ├─ unit: string
    ├─ precision: number
    ├─ slider: boolean
    ├─ hidden: boolean
    ├─ readOnly: boolean
    └─ colorFormat: 'hex' | 'rgb' | 'rgba'
    ↓
  validation?: PropertyValidation
    ├─ validate: (value) => boolean | string
    └─ transform?: (value) => value
    ↓
  getValue: (node) => unknown
  └─ Reads current value from node instance
    ↓
  setValue: (node, value) => void
  └─ Writes value to node instance
```

## Inspector Rendering Flow

```
InspectorPanel.render()
  │
  ├─ Check if node selected
  │
  └─ renderProperties()
     │
     ├─ Get propertySchema from node
     │
     ├─ Group properties by ui.group
     │
     ├─ Sort groups (Base first)
     │
     └─ renderPropertyGroup() for each group
        │
        ├─ Render group title
        │
        └─ renderPropertyInput() for each property
           │
           ├─ Check property type
           │
           ├─ Generate appropriate input
           │  ├─ boolean → checkbox
           │  ├─ number → number input + unit
           │  ├─ string → text input
           │  └─ other → text input (fallback)
           │
           └─ Apply UI hints
              ├─ label
              ├─ step/min/max
              ├─ precision
              ├─ disabled (if readOnly)
              └─ event handlers
```

## Class Relationships

```
ComponentBase
    ↑
    │ extends
    │
InspectorPanel
    │
    ├─ @inject(SceneManager)
    ├─ @inject(OperationService)
    │
    ├─ selectedNodes: NodeBase[]
    ├─ primaryNode: NodeBase | null
    ├─ propertySchema: PropertySchema | null
    └─ propertyValues: Record<string, PropertyUIState>

Node - Three.js Object3D
    ↑
    │ extends
    │
NodeBase
    ├─ nodeId: string
    ├─ name: string
    ├─ type: string
    ├─ properties: Record<string, unknown>
    ├─ metadata: NodeMetadata
    │
    └─ static getPropertySchema(): PropertySchema

    ├─ Node2D
    │   ├─ position: Vector2
    │   ├─ rotation: number (radians)
    │   ├─ scale: Vector2
    │   │
    │   ├─ Sprite2D
    │   │   └─ texturePath: string | null
    │   │
    │   └─ Group2D
    │       ├─ width: number
    │       └─ height: number
    │
    └─ Node3D
        ├─ position: Vector3
        ├─ rotation: Euler (radians)
        ├─ scale: Vector3
        │
        ├─ Camera3D
        │   └─ camera: Camera
        │
        ├─ DirectionalLightNode
        │   └─ light: Light
        │
        └─ GeometryMesh
            └─ mesh: Mesh
```

## Property Validation Flow

```
User enters value
    │
    ↓
PropertyDefinition.validation?.validate(value)
    │
    ├─ Returns boolean → if false, show error
    ├─ Returns string → treat as error message
    └─ Returns true → proceed
    │
    ↓
PropertyDefinition.validation?.transform(value)
    │
    └─ Optionally transform/normalize value
    │
    ↓
PropertyDefinition.setValue(node, transformedValue)
    │
    └─ Apply to node instance
```

## Key Design Patterns

### 1. **Schema Inheritance**
```typescript
const baseSchema = NodeBase.getPropertySchema();
return {
  properties: [...baseSchema.properties, ...myProperties],
  groups: { ...baseSchema.groups, ...myGroups },
};
```

### 2. **Getter/Setter Pattern**
```typescript
{
  getValue: (node) => (node as MyNode).value,
  setValue: (node, value) => { (node as MyNode).value = Number(value); },
}
```

### 3. **Type Conversion (Radians ↔ Degrees)**
```typescript
{
  getValue: (node) => (node as Node2D).rotation.z * (180 / Math.PI),
  setValue: (node, value) => {
    (node as Node2D).rotation.z = Number(value) * (Math.PI / 180);
  },
}
```

### 4. **Dynamic UI Hints**
```typescript
ui: {
  label: 'Rotation',
  group: 'Transform',
  unit: '°',
  step: 0.1,
  precision: 1,
}
```

## Integration Points

1. **Node Creation** - Pass props matching NodeXxxProps interface
2. **Node Selection** - Inspector calls `getNodePropertySchema()`
3. **Property Edit** - Creates `UpdateObjectPropertyOperation`
4. **Operation Execution** - Calls property `setValue()`
5. **UI Refresh** - Calls property `getValue()`

## Extensibility

All components are designed to be extended:

- **New Node Type** - Implement `getPropertySchema()`
- **New Property Type** - Add to `PropertyType` union
- **New UI Hint** - Add field to `PropertyUIHints`
- **Custom Validation** - Implement `PropertyValidation`
- **Custom Render** - Extend property input rendering logic
