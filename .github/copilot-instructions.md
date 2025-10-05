# Copilot Instructions

These guardrails help generate consistent code and documentation for the Pix3 editor. Treat them as authoritative unless the specification (`docs/pix3-specification.md`) or maintainers request an exception. Pix3 uses an operations-first model where OperationService is the single gateway for mutations and history.

## Project Overview

- **Pix3** is a browser-based editor for building HTML5 scenes that blend 2D and 3D layers, targeting playable ads and interactive experiences.
- **Target stack**: TypeScript + Vite, Lit web components with custom `fw` utilities, Valtio for reactive state, Three.js for 3D rendering, Golden Layout for dockable panels.
- **Source of truth**: `docs/pix3-specification.md` (v1.8, 2025-10-05) contains all requirements, architecture decisions, and MVP roadmap.
- **Target users**: Scene composers, gameplay developers, ad producers.

## Essential Architecture Patterns

### Component System
- Extend `ComponentBase` from `src/fw` instead of raw `LitElement`. It defaults to **light DOM** for global style integration.
- Use shadow DOM only when needed: `static useShadowDom = true` in your component class.
- Import helpers from `src/fw`: `customElement`, `property`, `state`, `css`, `html`, `inject`.
- Split component styles into separate CSS files: `[component].ts.css`, and import them into the component file (e.g., `pix3-welcome.ts` imports `pix3-welcome.ts.css`).
- Import from core folders using @ aliases (e.g., `@/fw`, `@/state`, `@/core`, `@/services`) instead of relative paths.

### Dependency Injection
- Services use `@injectable()` decorator and must expose `dispose()` method for cleanup.
- Inject services into components/commands via `@inject(ServiceClass)` - requires `reflect-metadata` polyfill.
- Register services with `ServiceContainer` - singleton by default, transient optional.

### State Management (Valtio)
- Global state lives in `appState` proxy from `src/state/AppState.ts` — never mutate directly.
- Mutations flow through Operations executed via OperationService. Commands are thin wrappers that invoke operations. Managers may update state directly only for non-interactive, non-history flows.
- UI subscribes to state changes via `subscribe(appState.section, callback)`.
- Use `snapshot(appState)` for read-only checks in command preconditions or operation validation.

### Commands and Operations
- Operations are first-class and encapsulate all mutation logic. Implement `perform()` and return an OperationCommit with `undo()`/`redo()` closures and optional metadata for coalescing and scene diffing.
- OperationService is the single gateway: `invoke(op)`, `invokeAndPush(op)`, `undo()`, `redo()`.
- Commands are thin wrappers: `preconditions()` → `execute()`; they never implement their own undo/redo. They validate context and call OperationService with operations. Register via metadata for the command palette.

## Critical Development Setup

### Required TypeScript Config
```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "useDefineForClassFields": false,
  "strict": true
}
```

### Development Commands
- `npm run dev` - Vite dev server with hot reload
- `npm run test` - Vitest unit tests (co-located `.spec.ts` files)
- `npm run build` - TypeScript compilation + Vite production build
- `npm run lint` - ESLint with Lit/a11y plugins

### Entry Point Flow
1. `src/main.ts` imports `reflect-metadata`, Golden Layout CSS, and registers all components
2. `index.html` renders `<pix3-editor>` shell component
3. Shell initializes Golden Layout (single default layout by default) and wires keyboard shortcuts to `OperationService.undo()` / `redo()`

## File Structure Conventions

```
src/
  fw/                      # Framework utilities (DI, ComponentBase)
  state/                   # Valtio state definitions
  core/
    features/
      selection/
        commands/
        operations/
      properties/
        commands/
        operations/
      scene/
        commands/
        operations/
      history/
        commands/         # Undo/Redo thin commands
    operations/           # OperationService, base types, events
    history/              # HistoryManager (bounded stacks)
    layout/               # Golden Layout integration
  ui/                     # Lit components extending ComponentBase
    welcome/
    scene-tree/
    viewport/
    object-inspector/
    assets-browser/
  services/               # Injectable services (FileSystem API, etc.)
```

## Scene File Format (.pix3scene)
- **YAML format** with `version`, node hierarchy under `root:`, unique node `id` fields.
- Asset references use `res://` prefix (relative to project root).
- Scene instances support property overrides.
- Validation via AJV schemas in `SceneManager`.

## Testing Patterns
- Unit tests with Vitest, using `vi.fn()` for mocks and `beforeEach()` cleanup.
- Prefer testing operation lifecycle and OperationService integration over command-owned undo.
- Validate operation `perform()`, commit `undo()`/`redo()` closures, coalescing (when applicable), and HistoryManager behavior.
- Test thin commands for preconditions and delegation to OperationService.

## Performance & Quality Gates
- Target ≥85 FPS viewport rendering, <6s cold start, <80ms command latency
- WCAG 2.1 AA compliance (keyboard nav, ARIA attributes, high-contrast themes)
- Chromium-only for MVP (show compatibility warning for other browsers)

## Key Integration Points
- **Golden Layout**: Panel management
- **File System Access API**: Direct project folder access, no upload/download
- **Valtio**: Reactive state with automatic UI updates
- **Three.js**: Single-engine rendering; orthographic overlay for 2D/HUD in the same pipeline
- **Plugin system**: Sandboxed extensions via manifest validation

Always cross-check architectural decisions against `docs/pix3-specification.md` before implementing features.
