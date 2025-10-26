# Pix3 Editor - AI Agent Guidelines

Based on the authoritative copilot instructions for Pix3 development. These guidelines ensure consistent code generation and adherence to project architecture patterns.

## Project Overview

- **Pix3** is a browser-based editor for HTML5 scenes blending 2D and 3D layers
- **Target stack**: TypeScript + Vite, Lit web components, Valtio state, Three.js, Golden Layout
- **Architecture model**: Operations-first with OperationService as single mutation gateway
- **Source of truth**: `docs/pix3-specification.md` (v1.8, 2025-10-05)

## Essential Architecture Patterns

### Component System
- Extend `ComponentBase` from `src/fw` (not raw `LitElement`)
- Default to **light DOM** for global style integration
- Use shadow DOM only when explicitly needed: `static useShadowDom = true`
- Import helpers from `src/fw`: `customElement`, `property`, `state`, `css`, `html`, `inject`
- Split styles into separate CSS files: `[component].ts.css`
- Use @ aliases for core imports: `@/fw`, `@/state`, `@/core`, `@/services`

### Dependency Injection
- Services use `@injectable()` decorator with `dispose()` method
- Inject services via `@inject(ServiceClass)` (requires reflect-metadata)
- Register services with `ServiceContainer` (singleton by default)

### State Management (Valtio)
- Global state in `appState` proxy from `src/state/AppState.ts` - never mutate directly
- All mutations flow through Operations via OperationService
- Commands are thin wrappers that invoke operations
- UI subscribes via `subscribe(appState.section, callback)`
- Use `snapshot(appState)` for read-only checks

### Commands and Operations
- **Operations** are first-class, encapsulate all mutation logic
- Implement `perform()` returning OperationCommit with `undo()`/`redo()` closures
- **OperationService** is single gateway: `invoke(op)`, `invokeAndPush(op)`, `undo()`, `redo()`
- **Commands** are thin wrappers: `preconditions()` → `execute()` → OperationService
- Commands never implement their own undo/redo logic

## File Structure Conventions

```
src/
  fw/                      # Framework utilities (DI, ComponentBase)
  state/                   # Valtio state definitions
  core/                    # Core business logic and managers
    BulkOperation.ts
    command.ts
    HistoryManager.ts
    LayoutManager.ts
    Operation.ts
    SceneLoader.ts
    SceneManager.ts
  features/                # Feature-specific commands and operations
    history/
      RedoCommand.ts
      UndoCommand.ts
    properties/
      UpdateObjectPropertyCommand.ts
      UpdateObjectPropertyOperation.ts
    scene/
      LoadSceneCommand.ts
      LoadSceneOperation.ts
    selection/
      SelectObjectCommand.ts
      SelectObjectOperation.ts
  nodes/                   # Node definitions for scene graph
    Node2D.ts
    Node3D.ts
    NodeBase.ts
    2D/
      Sprite2D.ts
    3D/
      Camera3D.ts
      DirectionalLightNode.ts
      MeshInstance.ts
      GeometryMesh.ts
  services/                # Injectable services
    AssetLoaderService.ts
    CommandDispatcher.ts
    FileSystemAPIService.ts
    FocusRingService.ts
    index.ts
    OperationService.ts
    ProjectService.ts
    ResourceManager.ts
    TemplateService.ts
    ViewportRenderService.ts
  templates/               # Project templates
    pix3-logo.png
    startup-scene.pix3scene
  ui/                      # Lit components extending ComponentBase
    pix3-editor-shell.ts
    pix3-editor-shell.ts.css
    assets-browser/
      asset-browser-panel.ts
      asset-browser-panel.ts.css
      asset-tree.ts
      asset-tree.ts.css
    object-inspector/
      inspector-panel.ts
      inspector-panel.ts.css
    scene-tree/
      node-visuals.helper.ts
      scene-tree-node.ts
      scene-tree-node.ts.css
      scene-tree-panel.ts
      scene-tree-panel.ts.css
    shared/
      pix3-panel.ts
      pix3-panel.ts.css
      pix3-toolbar-button.ts
      pix3-toolbar-button.ts.css
      pix3-toolbar.ts
      pix3-toolbar.ts.css
    viewport/
      viewport-panel.ts
      viewport-panel.ts.css
    welcome/
      pix3-welcome.ts
      pix3-welcome.ts.css
```

## Development Requirements

### Required TypeScript Config
```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "useDefineForClassFields": false,
  "strict": true
}
```

### Key Development Commands
- `npm run dev` - Vite dev server with hot reload
- `npm run test` - Vitest unit tests (co-located `.spec.ts` files)
- `npm run build` - TypeScript compilation + Vite production build
- `npm run lint` - ESLint with Lit/a11y plugins

## Scene File Format (.pix3scene)
- YAML format with version, node hierarchy under `root:`
- Unique node `id` fields required
- Asset references use `res://` prefix
- Property overrides supported
- AJV schema validation in `SceneManager`

## Performance & Quality Gates
- Target ≥85 FPS viewport rendering
- <6s cold start, <80ms command latency
- WCAG 2.1 AA compliance (keyboard nav, ARIA, high-contrast)
- Chromium-only for MVP

## Key Integration Points
- **Golden Layout**: Panel management
- **File System Access API**: Direct project access
- **Valtio**: Reactive state with automatic UI updates
- **Three.js**: Single-engine rendering with orthographic overlay
- **Plugin system**: Sandboxed extensions via manifest validation

## Critical Rules for AI Agents

1. **Never mutate `appState` directly** - always use Operations via OperationService
2. **Follow operations-first model** - Operations handle all mutations, Commands are thin wrappers
3. **Use ComponentBase** for all Lit components, not LitElement directly
4. **Import from `@/` aliases** - never use relative paths for core imports
5. **Separate styles** - each component has corresponding `.css` file
6. **Light DOM by default** - use shadow DOM only when explicitly needed
7. **Singleton services** - register with ServiceContainer, implement dispose()
8. **Cross-reference specification** - check `docs/pix3-specification.md` for architectural decisions

Always verify architectural decisions against the specification before implementing features.