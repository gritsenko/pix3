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

### Project Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production bundle
- `npm run preview` - Preview production build locally
- `npm run lint` - Check code style and errors
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier
- `npm run type-check` - Validate TypeScript types

## 🏗️ Architecture

Pix3 follows a modern, modular architecture:

- **Frontend**: TypeScript + Vite + Lit Web Components
- **State Management**: Valtio reactive proxies
- **3D Rendering**: Three.js with PixiJS overlay support
- **UI Layout**: Golden Layout dockable panels
- **Dependency Injection**: Custom DI container with decorators

### Project Structure

```
src/
├── core/          # Core business logic and managers
│   ├── BulkOperation.ts
│   ├── command.ts
│   ├── HistoryManager.ts
│   ├── LayoutManager.ts
│   ├── Operation.ts
│   ├── SceneLoader.ts
│   └── SceneManager.ts
├── features/      # Feature-specific commands and operations
│   ├── history/
│   │   ├── RedoCommand.ts
│   │   └── UndoCommand.ts
│   ├── properties/
│   │   ├── UpdateObjectPropertyCommand.ts
│   │   └── UpdateObjectPropertyOperation.ts
│   ├── scene/
│   │   ├── LoadSceneCommand.ts
│   │   └── LoadSceneOperation.ts
│   └── selection/
│       ├── SelectObjectCommand.ts
│       └── SelectObjectOperation.ts
├── fw/            # Framework utilities (ComponentBase, DI, etc.)
│   ├── component-base.ts
│   ├── di.ts
│   ├── from-query.ts
│   ├── index.ts
│   └── layout-component-base.ts
├── nodes/         # Node definitions for scene graph
│   ├── Node2D.ts
│   ├── Node3D.ts
│   ├── NodeBase.ts
│   ├── 2D/
│   │   └── Sprite2D.ts
│   └── 3D/
│       ├── Camera3D.ts
│       ├── DirectionalLightNode.ts
│       ├── MeshInstance.ts
│       └── GeometryMesh.ts
├── services/      # Injectable services
│   ├── AssetLoaderService.ts
│   ├── CommandDispatcher.ts
│   ├── FileSystemAPIService.ts
│   ├── FocusRingService.ts
│   ├── index.ts
│   ├── OperationService.ts
│   ├── ProjectService.ts
│   ├── ResourceManager.ts
│   ├── TemplateService.ts
│   └── ViewportRenderService.ts
├── state/         # Valtio state definitions
│   ├── AppState.ts
│   └── index.ts
├── templates/     # Project templates
│   ├── pix3-logo.png
│   └── startup-scene.pix3scene
└── ui/            # Lit components extending ComponentBase
    ├── pix3-editor-shell.ts
    ├── pix3-editor-shell.ts.css
    ├── assets-browser/
    │   ├── asset-browser-panel.ts
    │   ├── asset-browser-panel.ts.css
    │   └── asset-tree.ts
    │       └── asset-tree.ts.css
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

### Coding Standards
- Use TypeScript strict mode with decorators
- Extend `ComponentBase` for UI components
- Use `@inject()` decorator for dependency injection
- Follow command pattern for state mutations
- Emit telemetry events for user interactions

### File Conventions
- `*.component.ts` - UI components
- `*.service.ts` - Injectable services
- `*.command.ts` - Command implementations
- `*.spec.ts` / `*.test.ts` - Test files
- `index.ts` - Barrel exports

### State Management
- Use Valtio proxies for reactive state
- Commands are the **only** code allowed to modify state
- Follow command lifecycle: `preconditions()` → `execute()` → `postCommit()`

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