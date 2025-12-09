# Pix3 Architecture Diagram

This document contains a high-level architecture diagram for Pix3 and notes about viewing and exporting diagrams in VS Code. It reflects the current operations-first model where the CommandDispatcher Service is the primary entry point for all actions, ensuring consistent lifecycle management and preconditions checking.

## Mermaid diagram

Below is a Mermaid system diagram that represents the architecture described in `pix3-specification.md` (v1.9, operations-first).

```mermaid
flowchart LR
  subgraph UI
    A["ComponentBase (fw)"] --> B["Panels (Golden Layout)"]
    B --> C["Scene Tree"]
    B --> D["Viewport Component"]
    B --> E["Inspector"]
    B --> F["Asset Browser"]
    E2["Property Schema Utils"]
    E -->|uses| E2
    E3["Custom Editors<br/>(Vector2/3, Euler)"]
    E -->|renders with| E3
  end

  subgraph Core
    G["AppState (Valtio)"]
    H["OperationService (invoke, undo, redo)"]
    I["HistoryManager"]
    J["SceneManager"]
    K["PluginManager"]
    L["Plugin State Management"]
    P["CommandDispatcher Service"]
    Q["Commands (thin wrappers)"]
    S["Message Bus"]
  end

  subgraph Services
    M["FileSystemAPIService"]
    N["Telemetry / Analytics Stub"]
  end

  subgraph Rendering
    O["Three.js Pipeline (Perspective + Ortho Pass)"]
    R["ViewportRenderService"]
  end

  A ---|renders| D
  D ---|uses unified pipeline| O
  D ---|observes resize| R
  R ---|triggers resize| O

  C -->|reads| G
  E -->|reads| G
  P -->|executes commands| Q
  Q -->|invokes operations| H
  Q -->|emits events| S
  H -->|mutates via operations| G
  I -->|tracks| H
  J -->|loads/parses| G
  K -->|registers commands| P
  L -->|manages plugin state| G

  G -->|persists layout| M
  H -->|emits| N
  J -->|loads scenes| M

  %% All actions go through CommandDispatcher
  A -->|uses| P

  S -->|notifies| A

  O -->|reads scene nodes| J
```

## Property Schema System

Pix3 uses a **property schema system** (Godot-inspired) for dynamic object inspector UI generation. This replaces hardcoded property editors with declarative type information.

### Architecture Flow

```mermaid
graph TD
  Node["Node (NodeBase, Node2D, Sprite2D, etc.)"]
  Schema["getPropertySchema()<br/>(PropertyDefinition[])"]
  Inspector["InspectorPanel"]
  Utils["getNodePropertySchema()<br/>getPropertiesByGroup()"]
  Render["renderTransformGroup()<br/>renderTransformProperty()"]
  Editors["Custom Editors<br/>(Vector2/3Editor, EulerEditor)"]
  Operation["UpdateObjectPropertyOperation"]
  Viewport["Viewport Updates"]

  Node -->|implements| Schema
  Inspector -->|calls| Utils
  Utils -->|retrieves| Schema
  Utils -->|groups by| Inspector
  Inspector -->|calls render| Render
  Render -->|detects type| Editors
  Editors -->|emits change event| Inspector
  Inspector -->|creates| Operation
  Operation -->|uses getValue/setValue| Schema
  Operation -->|performs| Viewport
```

### Key Components

- **PropertySchema**: Defines typed property metadata for a node class
- **PropertyDefinition**: Individual property with name, type, getValue/setValue, UI hints (label, group, step, unit)
- **PropertyType**: Union type including `'vector2'`, `'vector3'`, `'euler'`, `'number'`, `'string'`, etc.
- **Custom Editors**: Web Components (`Vector2Editor`, `Vector3Editor`, `EulerEditor`) for grouped vector display
- **Grid Layout**: Transform properties use 6-column CSS Grid (1rem 1fr 1rem 1fr 1rem 1fr) with color-coded X/Y/Z labels
- **UpdateObjectPropertyOperation**: Uses schema's getValue/setValue for semantic transformations (e.g., radian/degree conversion)

### Creating a Node Schema

Node classes implement `getPropertySchema()` returning typed property definitions:

```typescript
export class Sprite2D extends Node2D {
  static getPropertySchema(): PropertySchema {
    return {
      ...Node2D.getPropertySchema(),
      
      texture: {
        type: 'string',
        label: 'Texture',
        group: 'Sprite',
        getValue: (node) => node.textureUrl || '',
        setValue: (node, value) => {
          // Custom logic here
        },
      },
      
      tint: {
        type: 'color',
        label: 'Tint Color',
        group: 'Sprite',
        getValue: (node) => node.tintColor,
        setValue: (node, value) => {
          node.tintColor = value;
        },
      },
    };
  }
}
```

### Property Type Support

| Type | Display | Usage |
|------|---------|-------|
| `'string'` | Text input | Names, URLs, IDs |
| `'number'` | Number input | Dimensions, angles, values |
| `'boolean'` | Checkbox | Flags, toggles |
| `'vector2'` | Grid with X/Y inputs | 2D positions, scales |
| `'vector3'` | Grid with X/Y/Z inputs | 3D positions, scales |
| `'euler'` | Grid with X/Y/Z° inputs | 3D rotations (degrees) |
| `'color'` | Color picker | Tint, highlight colors |
| `'enum'` | Dropdown | Predefined choices |
| `'select'` | List picker | Option selection |
| `'object'` | Nested object | Complex data structures |

### Grid Layout for Transform Properties

Transform group (position, rotation, scale) renders as 6-column grid with color-coded axes:

```css
.transform-fields {
  display: grid;
  grid-template-columns: 1rem 1fr 1rem 1fr 1rem 1fr;
  gap: 0.5rem;
  padding: 0.5rem;
}

.transform-field-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* Color-coded X/Y/Z labels */
.transform-field-label:nth-child(1) { color: #ff6b6b; } /* X - red */
.transform-field-label:nth-child(3) { color: #51cf66; } /* Y - green */
.transform-field-label:nth-child(5) { color: #4c6ef5; } /* Z - blue */
```

Result: Single-row display with compact axis labels and inline numeric inputs.

## Command-Driven Menu System

Menu items are generated from registered commands using metadata. This pattern replaces hardcoded menu structures with a flexible, extensible approach.

### CommandMetadata Extension
```typescript
interface CommandMetadata {
  // ... existing properties ...
  readonly menuPath?: string;    // 'edit', 'file', 'view', 'help'
  readonly shortcut?: string;    // '⌘Z', 'Ctrl+S' (display only)
  readonly addToMenu?: boolean;  // Include in main menu
}
```

### Menu Generation Flow
1. Commands register with CommandRegistry at app startup
2. CommandRegistry.buildMenuSections() groups commands by menuPath
3. Pix3MainMenu loads sections and renders menu items
4. Menu clicks execute commands via CommandDispatcher

### Execution Path
```
User clicks menu item
  ↓
Pix3MainMenu.executeMenuItem(commandId)
  ↓
CommandDispatcher.execute(command)
  ↓
Preconditions checked → Command.execute()
  ↓
Operation performed via OperationService
```

### Example: Adding to Edit Menu
```typescript
export class MyCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'edit.mycommand',
    title: 'My Command',
    menuPath: 'edit',        // Groups under Edit menu
    shortcut: '⌘M',
    addToMenu: true,
  };
  // ... implementation
}

// In editor shell:
this.commandRegistry.register(new MyCommand(dependencies));
```

The menu automatically updates without component changes.

## Roles

Pix3 is designed for a range of users with different priorities and workflows. The architecture supports flexible UI layouts, plugin APIs, and export options to meet these needs.

### Example: Adding to Edit Menu
```typescript
export class MyCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'edit.mycommand',
    title: 'My Command',
    menuPath: 'edit',        // Groups under Edit menu
    shortcut: '⌘M',
    addToMenu: true,
  };
  // ... implementation
}

// In editor shell:
this.commandRegistry.register(new MyCommand(dependencies));
```

The menu automatically updates without component changes.

## Roles

Pix3 is designed for a range of users with different priorities and workflows. The architecture supports flexible UI layouts, plugin APIs, and export options to meet these needs.