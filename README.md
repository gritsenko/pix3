# Pix3 Editor

**Pix3** is a browser-based editor for building HTML5 scenes that blend 2D and 3D layers. It empowers creators to craft interactive experiences, playable ads, and multimedia content using modern web technologies.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Modern Chromium-based browser (Chrome, Edge, Arc)

### Development Setup

1. **Clone and install**:
   ```bash
   git clone <repository-url>
   cd pix3
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**:
   Navigate to `http://localhost:5173`

### Debugging with Chrome & MCP (Chrome DevTools) 🔧

You can debug the app using Chrome's remote DevTools and the MCP bridge. The repository includes a VS Code launch config (`.vscode/launch.json`) and an MCP server entry (`mcp.json`) to simplify this.

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Launch Chrome with remote debugging (the included `Launch Chrome against localhost` config in `.vscode/launch.json` uses these flags). To start manually on Windows:
   ```bash
   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\\pix3-chrome-debug"
   ```

3. Start the MCP server (from the workspace root) to bridge Chrome DevTools to VS Code:
   ```bash
   npx chrome-devtools-mcp@0.12.1 --autoConnect --browserUrl=http://127.0.0.1:9222
   ```
   Or keep the `mcp.json` entry (example below) and let your MCP client/extension use it:
   ```json
   {
     "servers": {
       "mcp_chrome": {
         "type": "stdio",
         "command": "npx",
         "args": [
           "chrome-devtools-mcp@0.12.1",
           "--autoConnect",
           "--browserUrl=http://127.0.0.1:9222"
         ],
         "gallery": "https://api.mcp.github.com",
         "version": "0.12.1"
       }
     },
     "inputs": []
   }
   ```

4. Use the MCP/DevTools UI to open the page at `http://localhost:5173`, inspect elements, view console logs, and capture traces.

Notes:
- If Chrome is already running, close other instances or use a separate `--user-data-dir` to avoid profile conflicts.
- The `.vscode/launch.json` config already sets the necessary runtime args for remote debugging.

### Project Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production bundle
- `npm run preview` - Preview production build locally
- `npm run lint` - Check code style and errors
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier
- `npm run type-check` - Validate TypeScript types

## 🏗️ Architecture

Pix3 follows a modern, modular operations-first architecture:

- **Frontend**: TypeScript + Vite + Lit Web Components using `ComponentBase`
- **State Management**: Valtio reactive proxies for UI, scenes metadata, and selection
- **Node Management**: SceneManager + SceneGraph for non-reactive node data (extends Three.js Object3D)
- **3D Rendering**: Three.js single-engine pipeline (3D perspective + 2D orthographic overlay)
- **UI Layout**: Golden Layout for dockable, resizable panels
- **Dependency Injection**: Custom DI container with `@injectable()` and `@inject()` decorators
- **Command Pattern**: Operations-first model with Commands as thin wrappers via CommandDispatcher Service

### Key Architecture Principles

- **Operations-First**: All state mutations flow through Operations executed by OperationService
- **Commands via CommandDispatcher**: All UI actions must use Commands through CommandDispatcher Service
- **Nodes NOT in State**: Nodes are managed by SceneManager in SceneGraph objects (not Valtio). State tracks only node IDs for selection/hierarchy
- **Unidirectional Flow**: UI → CommandDispatcher → Operations → State → UI subscription updates
- **Reactive State Only**: AppState contains only UI state, scenes metadata, and selection IDs

### Project Structure

```
src/
├── core/          # Core business logic and managers
│   ├── AssetLoader.ts
│   ├── BulkOperation.ts
│   ├── command.ts             # Command/Operation base contracts
│   ├── HistoryManager.ts
│   ├── LayoutManager.ts
│   ├── Operation.ts
│   ├── SceneLoader.ts
│   └── SceneManager.ts        # Owns SceneGraph and Node lifecycle (non-reactive)
├── features/      # Feature-specific commands and operations
│   ├── history/
│   │   ├── RedoCommand.ts
│   │   └── UndoCommand.ts
│   ├── properties/
│   │   ├── UpdateObjectPropertyCommand.ts
│   │   └── UpdateObjectPropertyOperation.ts
│   ├── scene/
│   │   └── LoadSceneCommand.ts
│   └── selection/
│       ├── SelectObjectCommand.ts
│       └── SelectObjectOperation.ts
├── fw/            # Framework utilities (ComponentBase, DI, etc.)
│   ├── component-base.ts      # Extends LitElement with light DOM default
│   ├── di.ts                  # Dependency injection container
│   ├── from-query.ts
│   ├── index.ts
│   └── layout-component-base.ts
├── nodes/         # Node definitions (NOT in reactive state)
│   ├── Node2D.ts
│   ├── Node3D.ts
│   ├── NodeBase.ts            # Extends Three.js Object3D
│   ├── 2D/
│   │   └── Sprite2D.ts
│   └── 3D/
│       ├── Camera3D.ts
│       ├── DirectionalLightNode.ts
│       ├── GeometryMesh.ts
│       ├── GlbModel.ts
│       └── MeshInstance.ts
├── services/      # Injectable services
│   ├── AssetFileActivationService.ts
│   ├── AssetLoaderService.ts
│   ├── CommandDispatcher.ts   # Primary entry point for all actions
│   ├── FileSystemAPIService.ts
│   ├── FocusRingService.ts
│   ├── index.ts
│   ├── OperationService.ts    # Executes operations; gateway for mutations
│   ├── ProjectService.ts
│   ├── ResourceManager.ts
│   ├── TemplateService.ts
│   └── ViewportRenderService.ts
├── state/         # Valtio reactive state (UI, metadata, selection only)
│   ├── AppState.ts            # Defines reactive state shape
│   └── index.ts
├── templates/     # Project templates
│   ├── pix3-logo.png
│   ├── startup-scene.pix3scene
│   └── test_model.glb
└── ui/            # Lit components extending ComponentBase
    ├── pix3-editor-shell.ts
    ├── pix3-editor-shell.ts.css
    ├── assets-browser/
    │   ├── asset-browser-panel.ts
    │   ├── asset-browser-panel.ts.css
    │   ├── asset-tree.ts
    │   └── asset-tree.ts.css
    ├── object-inspector/
    │   ├── inspector-panel.ts
    │   └── inspector-panel.ts.css
    ├── scene-tree/
    │   ├── node-visuals.helper.ts
    │   ├── scene-tree-node.ts
    │   ├── scene-tree-node.ts.css
    │   ├── scene-tree-panel.ts
    │   └── scene-tree-panel.ts.css
    ├── shared/
    │   ├── pix3-panel.ts
    │   ├── pix3-panel.ts.css
    │   ├── pix3-toolbar-button.ts
    │   ├── pix3-toolbar-button.ts.css
    │   ├── pix3-toolbar.ts
    │   └── pix3-toolbar.ts.css
    ├── viewport/
    │   ├── viewport-panel.ts
    │   └── viewport-panel.ts.css
    └── welcome/
        ├── pix3-welcome.ts
        └── pix3-welcome.ts.css
```

## 📋 Development Guidelines

### State Management & Operations
- **AppState** (Valtio): Contains only UI state, scenes metadata, and selection node IDs
- **SceneGraph** (SceneManager): Owns all Node instances; non-reactive and managed separately
- **Operations**: Encapsulate all mutations; return OperationCommit with undo/redo closures
- **Commands**: Thin wrappers that validate preconditions and invoke operations via OperationService
- **CommandDispatcher**: Primary entry point for all user actions; ensures consistent lifecycle, preconditions, telemetry

### Property Schema System

Pix3 uses a **Godot-inspired property schema system** for dynamic object inspector UI generation. Instead of hardcoding property editors, node classes declare their properties declaratively.

#### How It Works
1. **Node classes expose schemas**: Each node type (Node2D, Sprite2D, etc.) implements `static getPropertySchema()` returning typed property definitions
2. **Inspector renders dynamically**: The Object Inspector uses `getNodePropertySchema()` and `getPropertiesByGroup()` utilities to auto-generate editors
3. **Schema-based mutations**: Property changes flow through `UpdateObjectPropertyOperation` which uses schema's getValue/setValue methods for transformation (e.g., radians ↔ degrees)

#### Property Schema Example
```typescript
// In Node2D.ts
static getPropertySchema(): PropertySchema {
  return {
    ...NodeBase.getPropertySchema(),
    position: {
      type: 'vector2',
      label: 'Position',
      group: 'Transform',
      getValue: (node) => ({ x: node.position.x, y: node.position.y }),
      setValue: (node, value) => {
        node.position.x = value.x;
        node.position.y = value.y;
      },
    },
    rotation: {
      type: 'number',
      label: 'Rotation',
      group: 'Transform',
      unit: '°',
      step: 1,
    },
    scale: {
      type: 'vector2',
      label: 'Scale',
      group: 'Transform',
      getValue: (node) => ({ x: node.scale.x, y: node.scale.y }),
      setValue: (node, value) => {
        node.scale.x = value.x;
        node.scale.y = value.y;
      },
    },
  };
}
```

#### Supported Property Types
- `'string'` - Text input
- `'number'` - Numeric input
- `'boolean'` - Checkbox
- `'vector2'` - {x, y} coordinates (grid layout with color-coded labels)
- `'vector3'` - {x, y, z} coordinates (grid layout with color-coded labels)
- `'euler'` - {x, y, z} rotation in degrees (internally radians)
- `'color'` - Color picker
- `'enum'` - Dropdown selection
- `'select'` - List selection
- `'object'` - Generic nested object

#### Custom Editors
Vector and rotation properties render with custom Web Components (`Vector2Editor`, `Vector3Editor`, `EulerEditor`) in a unified grid layout:
- Transform group uses 6-column grid layout (1rem 1fr 1rem 1fr 1rem 1fr)
- X/Y/Z labels color-coded: red (#ff6b6b), green (#51cf66), blue (#4c6ef5)
- Single-row display with inline label and input for each axis
- Automatic undo/redo support through UpdateObjectPropertyOperation

### Component Architecture
- Extend `ComponentBase` (not raw LitElement) for all Lit components
- Use light DOM by default for global style integration
- Split styles into separate `[component].ts.css` files
- Use `@inject()` decorator for dependency injection
- Components are "dumb" — they read from state and dispatch commands

### Coding Standards
- Use TypeScript strict mode with decorators
- All actions must use Commands through CommandDispatcher
- Never mutate `appState` directly
- Services implement `@injectable()` and `dispose()` methods
- Import from `@/` aliases, never relative paths for core code

### Styling & Theme Variables

**Centralized Accent Color**: Use CSS custom properties instead of hardcoded color values:
- `--pix3-accent-color: #ffcf33` — For direct hex references
- `--pix3-accent-rgb: 255, 207, 51` — For use in rgba() functions with opacity

```css
/* Apply accent color with varying opacity */
background: rgba(var(--pix3-accent-rgb), 0.8);      /* 80% opacity */
box-shadow: 0 0 0 2px rgba(var(--pix3-accent-rgb), 0.3);  /* 30% opacity */
border-color: rgba(var(--pix3-accent-rgb), 0.45);   /* 45% opacity */
```

Both variables are defined in `:root` in `src/index.css` and available globally. To change the theme accent color, update these CSS variables — all buttons, tabs, panels, and interactive elements will automatically reflect the new color.

### File Conventions
- `*.command.ts` - Command implementations
- `*.operation.ts` - Operation implementations
- `*.service.ts` - Injectable services
- `*.spec.ts` / `*.test.ts` - Test files
- `[component].ts.css` - Component styles
- `index.ts` - Barrel exports

## 🎯 Command-Driven Menu System

The menu is generated from registered commands with metadata. Commands opt-in via `addToMenu: true` property.

### Command Metadata Properties
```typescript
interface CommandMetadata {
  id: CommandId;                    // Unique identifier
  title: string;                    // Display label
  menuPath?: string;                // Menu section ('edit', 'file', 'view', 'help')
  shortcut?: string;                // Display shortcut ('⌘Z', 'Ctrl+S')
  addToMenu?: boolean;              // Include in main menu
  menuOrder?: number;               // Sort order (lower = earlier; default: registration order)
  // ... other properties
}
```

### Adding a Command to Menu

1. **Set metadata properties**:
   ```typescript
   readonly metadata: CommandMetadata = {
     id: 'file.new',
     title: 'New Project',
     menuPath: 'file',
     shortcut: '⌘N',
     addToMenu: true,
     menuOrder: 0,  // Optional: controls sort order
   };
   ```

2. **Register in editor shell** (`src/ui/pix3-editor-shell.ts`):
   ```typescript
   this.commandRegistry.register(new NewProjectCommand(dependencies));
   ```

3. **Menu updates automatically** — no component changes needed

### Menu Item Ordering
- Items in each menu section are sorted by `menuOrder` first
- Commands without `menuOrder` are sorted by registration order
- This ensures consistent menu layouts regardless of registration order
- Example: Undo (`menuOrder: 0`) always appears before Redo (`menuOrder: 1`)

### Current Implementation
- Undo/Redo commands with menu metadata and shortcuts
- CommandRegistry service manages registration and menu building
- Pix3MainMenu generates sections from registered commands
- Menu items execute commands via CommandDispatcher

## 🧪 Testing & Quality

- **Unit Tests**: Vitest for command logic, services, and utilities
- **Linting**: ESLint with TypeScript and Lit-specific rules
- **Formatting**: Prettier with project-specific config
- **Type Safety**: Strict TypeScript configuration
- **Accessibility**: WCAG 2.1 AA compliance target

## 📈 Performance Targets

- **Viewport FPS**: ≥85 FPS on baseline hardware
- **Cold Start**: <6 seconds to interactive
- **Command Latency**: <80ms from input to UI update
- **Memory Usage**: Efficient cleanup and disposal patterns

## 🔌 Plugin System

Pix3 supports extensible plugins for tools, importers, and exporters:

```typescript
// Example plugin registration
@injectable()
export class BasicToolsPlugin implements IPlugin {
  async activate(context: IPluginContext) {
    // Register tools, commands, UI components
  }
}
```

## 📄 Scene Format

Scenes are stored as YAML `.pix3scene` files:

```yaml
version: "1.0"
metadata:
  title: "My Scene"
  created: "2025-09-26T10:00:00Z"
nodes:
  - id: "node_001"
    type: "Node3D"
    transform:
      position: [0, 0, 0]
      rotation: [0, 0, 0]
      scale: [1, 1, 1]
assets:
  - id: "texture_001"
    path: "res://textures/diffuse.png"
    type: "texture"
```

## 🤝 Contributing

1. Create feature branch from `main`
2. Follow coding standards and conventions
3. Add tests for new functionality
4. Ensure CI passes (lint, type-check, build)
5. Submit pull request with clear description

## 📚 Documentation

- [Technical Specification](./docs/pix3-specification.md) - Complete architecture and requirements
- [Development Todo](./docs/todo.md) - Current development status and milestones
- [Framework Utils](./src/fw/) - ComponentBase and DI system documentation

## 📝 License

[Add your license information here]

---

**Built with ❤️ for creators who blend pixels and polygons**