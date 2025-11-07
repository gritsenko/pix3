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
- State includes UI, scenes metadata, selection (node IDs), and operations lifecycle
- **Nodes are NOT in reactive state** — they are managed by `SceneManager` and stored in `SceneGraph` objects. Node references sync to state only as IDs in `SceneHierarchyState.rootNodes` (for UI consumption of tree structure)
- All mutations flow through Operations via OperationService
- Commands are thin wrappers that invoke operations
- UI subscribes via `subscribe(appState.section, callback)` for reactive updates
- Use `snapshot(appState)` for read-only checks

### Commands and Operations
- **Operations** are first-class, encapsulate all mutation logic
- Implement `perform()` returning OperationCommit with `undo()`/`redo()` closures
- **OperationService** is the gateway for executing operations: `invoke(op)`, `invokeAndPush(op)`, `undo()`, `redo()`
- **CommandDispatcher Service** is the primary entry point for all actions. All UI and tools must use Commands via CommandDispatcher to ensure consistent lifecycle management, preconditions checking, and telemetry.
- **Commands** are thin wrappers: `preconditions()` → `execute()` → OperationService via CommandDispatcher
- Commands never implement their own undo/redo logic

## File Structure Conventions

```
src/
  core/                    # Core business logic and managers
    AssetLoader.ts
    BulkOperation.ts
    command.ts             # Command/Operation base contracts
    HistoryManager.ts
    LayoutManager.ts
    Operation.ts
    SceneLoader.ts
    SceneManager.ts        # Owns SceneGraph and Node lifecycle (non-reactive)
  features/                # Feature-specific commands and operations
    history/
      RedoCommand.ts
      UndoCommand.ts
    properties/
      UpdateObjectPropertyCommand.ts
      UpdateObjectPropertyOperation.ts
    scene/
      LoadSceneCommand.ts
    selection/
      SelectObjectCommand.ts
      SelectObjectOperation.ts
  fw/                      # Framework utilities (DI, ComponentBase)
    component-base.ts
    di.ts
    from-query.ts
    index.ts
    layout-component-base.ts
  nodes/                   # Node definitions (NOT in reactive state)
    Node2D.ts
    Node3D.ts
    NodeBase.ts            # Extends Three.js Object3D; purely data/logic
    2D/
      Sprite2D.ts
    3D/
      Camera3D.ts
      DirectionalLightNode.ts
      GeometryMesh.ts
      GlbModel.ts
      MeshInstance.ts
  services/                # Injectable services
    AssetFileActivationService.ts
    AssetLoaderService.ts
    CommandDispatcher.ts   # Primary entry point for all actions
    FileSystemAPIService.ts
    FocusRingService.ts
    index.ts
    OperationService.ts    # Executes operations; gateway for mutations
    ProjectService.ts
    ResourceManager.ts
    TemplateService.ts
    ViewportRenderService.ts
  state/                   # Valtio reactive state (UI, metadata, selection only)
    AppState.ts
    index.ts
  templates/               # Project templates
    pix3-logo.png
    startup-scene.pix3scene
    test_model.glb
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

1. **Never mutate `appState` directly** — always use Operations via OperationService
2. **Follow operations-first model** — Operations handle all mutations, Commands are thin wrappers
3. **Use CommandDispatcher Service for all actions** — All UI and tools must perform actions via Commands through CommandDispatcher instead of directly invoking operations
4. **Nodes are NOT reactive state** — they live in `SceneGraph` (managed by `SceneManager`), not `appState`. State tracks node IDs for selection/hierarchy reference only
5. **Use ComponentBase** for all Lit components, not LitElement directly
6. **Import from `@/` aliases** — never use relative paths for core imports
7. **Separate styles** — each component has corresponding `.css` file
8. **Light DOM by default** — use shadow DOM only when explicitly needed
9. **Singleton services** — register with ServiceContainer, implement dispose()
10. **Cross-reference specification** — check `docs/pix3-specification.md` for architectural decisions
11. **Avoid bloat documentation** — Do NOT create detailed changelog or bloat MD files. Project is still in prototype stage. Only update existing docs (README.md, AGENTS.md, architecture.md, pix3-specification.md). Keep documentation minimal and focused on active development.

Always verify architectural decisions against the specification before implementing features.

## Additional Agent Instructions

### Dev Server
- The development server is always started manually by the developer on `localhost:5173`.
- Agents must not attempt to start the dev server themselves.

### Command-Driven Menu System
- Commands opt into the menu via metadata properties: `menuPath`, `shortcut`, `addToMenu`
- Register commands with `CommandRegistry` in editor shell at app startup
- Menu is generated automatically from registered commands — no hardcoded menu structure
- To add a command to menu: set metadata properties and register with registry
- Menu items execute commands through `CommandDispatcher` for consistent lifecycle

### Browser Interaction
- Agents can use the `#browsermcp` MCP server to navigate pages, read logs and make screenshots.
- Avoid of use clicking, pressing keys and other input simulations. Ask developer instead to make some changes on the page, before making screenshot or gather logs. The only exception is to open recent project on app statrup.
- Prefer add console log over using screenshots.
- Never launch url's directly use MCP to navigate necessary page. Never open simple browser.
- Logs and snapshots can be read using the MCP browser tools.

### Default Scene Loading
- After the page is refreshed, the agent should click on the first recent project in the list to load the default scene.