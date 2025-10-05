# Copilot Instructions

These guardrails help generate consistent code and documentation for the Pix3 editor. Treat them as authoritative unless the specification (`docs/pix3-specification.md`) or maintainers request an exception.

## Project Overview

- **Pix3** is a browser-based editor for building HTML5 scenes that blend 2D and 3D layers, targeting playable ads and interactive experiences.
- **Target stack**: TypeScript + Vite, Lit web components with custom `fw` utilities, Valtio for reactive state, Three.js for 3D rendering, Golden Layout for dockable panels.
- **Source of truth**: `docs/pix3-specification.md` (v1.5, 2025-09-26) contains all requirements, architecture decisions, and MVP roadmap.
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
- Global state lives in `appState` proxy from `src/state/AppState.ts` - **never mutate directly**.
- Commands are the **only** code allowed to modify state via the proxy, except for Managers which can modify state directly when no user interaction is performed and no undo/redo operations are created.
- UI subscribes to state changes via `subscribe(appState.section, callback)`.
- Use `snapshot(appState)` for read-only access in command preconditions.

### Command Pattern
- Commands follow strict lifecycle: `preconditions()` → `execute()` → `postCommit()`.
- Must be idempotent and emit telemetry events on execution.
- Return undo payloads from `postCommit()` for `HistoryManager` integration.
- Register commands via metadata with keywords for command palette.

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
3. Shell initializes Golden Layout with layout presets

## File Structure Conventions

```
src/
  fw/                    # Framework utilities (DI, ComponentBase)
  state/                 # Valtio state definitions
  core/
    commands/            # Command pattern implementations
    operations/          # Legacy operation system (being replaced)
    history/             # Undo/redo with bounded stacks
    layout/              # Golden Layout integration
  components/            # Lit components extending ComponentBase
    shell/               # Main editor shell
    scene/               # Scene tree panel
    viewport/            # 3D viewport panel
    inspector/           # Property inspector
    assets/              # Asset browser
  services/              # Injectable services (FileSystem API, etc.)
```

## Scene File Format (.pix3scene)
- **YAML format** with `version`, node hierarchy under `root:`, unique node `id` fields.
- Asset references use `res://` prefix (relative to project root).
- Scene instances support property overrides.
- Validation via AJV schemas in `SceneManager`.

## Testing Patterns
- Unit tests with Vitest, using `vi.fn()` for mocks and `beforeEach()` cleanup.
- Test command lifecycle, service injection, state mutations, and edge cases.
- Example pattern from `command.spec.ts`: test telemetry hooks, disposal, state snapshots.

## Performance & Quality Gates
- Target ≥85 FPS viewport rendering, <6s cold start, <80ms command latency
- WCAG 2.1 AA compliance (keyboard nav, ARIA attributes, high-contrast themes)
- Chromium-only for MVP (show compatibility warning for other browsers)

## Key Integration Points
- **Golden Layout**: Panel management
- **File System Access API**: Direct project folder access, no upload/download
- **Valtio**: Reactive state with automatic UI updates
- **Three.js**: 3D rendering (PixiJS overlay planned for v2)
- **Plugin system**: Sandboxed extensions via manifest validation

Always cross-check architectural decisions against `docs/pix3-specification.md` before implementing features.
