# Pix3 Editor - AI Agent Guidelines

Based on the authoritative copilot instructions for Pix3 development. These guidelines ensure consistent code generation and adherence to project architecture patterns.

## Project Overview

- **Pix3** is a browser-based editor for HTML5 scenes blending 2D and 3D layers
- **Target stack**: TypeScript + Vite, Lit web components, Valtio state, Three.js, Golden Layout
- **Architecture model**: Operations-first with OperationService as single mutation gateway
- **Source of truth**: `docs/pix3-specification.md` (v1.14, 2026-02-23)

## Essential Architecture Patterns

### Component System

- Extend `ComponentBase` from `src/fw` (not raw `LitElement`)
- Default to **light DOM** for global style integration
- Use shadow DOM only when explicitly needed: `static useShadowDom = true`
- Import helpers from `src/fw`: `customElement`, `property`, `state`, `css`, `html`, `inject`, `unsafeCSS`
- Split styles into separate CSS files: `[component].ts.css`
- Use @ aliases for core imports: `@/fw`, `@/state`, `@/core`, `@/services`

**Light DOM Components (default)**:

- No `static useShadowDom` needed (defaults to false)
- Import CSS directly: `import './component-name.ts.css';`
- No `static styles` property needed
- No `css` or `unsafeCSS` imports needed
- **CSS**: use component tag selector for scoping: `pix3-component-name .class-name { }`
- Use attribute selectors instead of `:host` (which only works in shadow DOM)

**Shadow DOM Components** (when explicitly enabled):

- Set `static useShadowDom = true;`
- Import CSS with `?raw` suffix: `import styles from './component-name.ts.css?raw';`
- Add `static styles = css`${unsafeCSS(styles)}`;` property
- Import `css` and `unsafeCSS` from `@/fw`
- **CSS**: use `:host` selector for component root styling
- Styles are encapsulated and don't affect global styles

Examples:

- Light DOM: `pix3-scene-tree-panel.ts`, `pix3-logs-panel.ts`, `pix3-status-bar.ts`
- Shadow DOM: `pix3-panel.ts`, `pix3-toolbar.ts`, `pix3-viewport-panel.ts`

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
- Always store and dispose subscription cleanup callbacks in component/service teardown methods (`disconnectedCallback`, `dispose`)

### Script Component System

- **Unified Component System**: All scripts are `ScriptComponent` instances attached via `node.components` array (Unity-style)
- **Script Base Class**: Extend `Script` abstract class for custom components (replaces separate `BehaviorBase` and `ScriptControllerBase`)
- **Script Lifecycle**: All scripts implement lifecycle methods: `onAttach`, `onStart`, `onUpdate`, `onDetach`
- **Property Schema**: Components expose editable parameters via `static getPropertySchema()`
- **ScriptRegistry**: Central registry for registering and creating script types (now supports unified components)
- **ScriptExecutionService**: Manages game loop, calls `tick(dt)` on nodes, handles lifecycle
- **Node Ticking**: Nodes have `tick(dt)` method that updates enabled components and recursively ticks children
- **Component API**: Use `node.addComponent()`, `node.removeComponent()`, `node.getComponent<T>(type)` for component management
- **All component mutations must use Commands** — AddComponentCommand, RemoveComponentCommand (legacy commands still supported)
- **Component config via UpdateObjectPropertyCommand** — Components use same property schema system as nodes
- **Backward Compatibility**: Legacy `behaviors` array and `controller` property still accessible via getters/setters

### Commands and Operations

- **Operations** are first-class, encapsulate all mutation logic
- Implement `perform()` returning OperationCommit with `undo()`/`redo()` closures
- **OperationService** is the gateway for executing operations: `invoke(op)`, `invokeAndPush(op)`, `undo()`, `redo()`
- **CommandDispatcher Service** is the primary entry point for all actions. All UI and tools must use Commands via CommandDispatcher to ensure consistent lifecycle management, preconditions checking, and telemetry.
- **Commands** are thin wrappers: `preconditions()` → `execute()` → OperationService via CommandDispatcher
- Commands never implement their own undo/redo logic
- **Play mode UI state** (`ui.isPlaying`, `ui.playModeStatus`) must be changed via `SetPlayModeOperation` (no direct writes in commands/services)
- **Scene create commands** must inherit from `CreateNodeBaseCommand` and use `scene-command-utils.ts` helpers for active-scene preconditions and created-node payload extraction
- **Create operations must keep selection consistent** — whenever a node is created, set both `selection.nodeIds = [nodeId]` and `selection.primaryNodeId = nodeId`; undo/redo must clear/restore both symmetrically

### Property Schema System (NEW)

- Godot-inspired declarative property metadata for dynamic UI generation
- Node classes expose properties via static `getPropertySchema()` returning `PropertySchema`
- `PropertyDefinition` includes: name, type, getValue/setValue closures, optional UI hints (label, group, step, precision, unit, etc.)
- Schemas inherit: child schemas extend parent via spread operator, matching class hierarchy
- **PropertyType** union: `'string' | 'number' | 'boolean' | 'vector2' | 'vector3' | 'euler' | 'color' | 'enum' | 'select' | 'object'`
- Vector types (vector2, vector3) handled as objects: `{ x, y }` or `{ x, y, z }`
- Euler type: rotation in degrees (converted to/from radians internally)
- Inspector uses `getNodePropertySchema()` and `getPropertiesByGroup()` to render UI dynamically
- All property mutations via `UpdateObjectPropertyOperation` which uses schema's `getValue/setValue` methods

### 2D/3D Navigation Mode

- **Modes**: `appState.ui.navigationMode` toggles between `'2d'` and `'3d'`.
- **3D Mode**: Uses `OrbitControls` with perspective camera.
- **2D Mode**: Uses custom pan/zoom implementation with orthographic camera. OrbitControls are disabled to prevent event interception.
- **Layout2D Integration**: 2D mode is optimized for interacting with `Layout2D` root nodes and 2D elements.
- **Command**: Use `ToggleNavigationModeCommand` to switch modes.

### Node Prefabs System

- **Prefab Files**: `.pix3scene` files that can be instanced in other scenes via `instance:` YAML key
- **Prefab Metadata**: Stored in node `metadata.__pix3Prefab` with fields: `localId`, `effectiveLocalId`, `instanceRootId`, `sourcePath`, `basePropertiesByLocalId`
- **Prefab Utilities** (`prefab-utils.ts`):
  - `getPrefabMetadata(node)` - retrieves prefab metadata or null
  - `isPrefabNode(node)` - true if node is linked to a prefab
  - `isPrefabInstanceRoot(node)` - true if node is the root of a prefab instance
  - `isPrefabChildNode(node)` - true if node is a child of a prefab instance
  - `findPrefabInstanceRoot(node)` - walks up to find the instance root
- **Prefab Operations**:
  - `CreatePrefabInstanceOperation` - instantiates a prefab file as nodes
  - `SaveAsPrefabOperation` - saves selected node branch as prefab file, replaces with instance
  - `RefreshPrefabInstancesOperation` - rebuilds instance hierarchy from source prefab
- **Prefab Commands**: `CreatePrefabInstanceCommand`, `SaveAsPrefabCommand`, `RefreshPrefabInstancesCommand`
- **Inspector Integration**: Shows base prefab values, allows reverting property overrides
- **Auto-refresh**: FileWatchService triggers `RefreshPrefabInstancesCommand` when prefab files change

## File Structure Conventions

```
src/
  behaviors/               # Built-in behavior implementations
    register-behaviors.ts
    RotateBehavior.ts
  core/                    # Core business logic and managers
    AssetLoader.ts
    BulkOperation.ts
    ScriptComponent.ts      # Script component interfaces and base classes
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
      CreateNodeBaseCommand.ts    # Shared base for all Create*Command wrappers
      scene-command-utils.ts      # Shared create-scene command helpers
      LoadSceneCommand.ts
      prefab-utils.ts             # Prefab metadata helpers and type definitions
      CreatePrefabInstanceCommand.ts
      CreatePrefabInstanceOperation.ts
      SaveAsPrefabCommand.ts
      SaveAsPrefabOperation.ts
      RefreshPrefabInstancesCommand.ts
      RefreshPrefabInstancesOperation.ts
    scripts/
      AttachBehaviorCommand.ts
      AttachBehaviorOperation.ts
      ClearControllerCommand.ts
      ClearControllerOperation.ts
      DetachBehaviorCommand.ts
      DetachBehaviorOperation.ts
      PlaySceneCommand.ts
      SetPlayModeOperation.ts
      SetControllerCommand.ts
      SetControllerOperation.ts
      StopSceneCommand.ts
      ToggleScriptEnabledCommand.ts
      ToggleScriptEnabledOperation.ts
    selection/
      SelectObjectCommand.ts
      SelectObjectOperation.ts
  fw/                      # Framework utilities (DI, ComponentBase, property schema)
    component-base.ts
    di.ts
    from-query.ts
    index.ts
    layout-component-base.ts
    property-schema.ts              # PropertyDefinition, PropertySchema, PropertyUIHints, PropertyType
    property-schema-utils.ts        # getNodePropertySchema, getPropertiesByGroup, getPropertyDisplayValue
  nodes/                   # Node definitions (NOT in reactive state)
    Node2D.ts              # Has getPropertySchema() with position (vector2), rotation (number), scale (vector2)
    Node3D.ts              # Has getPropertySchema() with position (vector3), rotation (euler), scale (vector3)
    NodeBase.ts            # Extends Three.js Object3D; has getPropertySchema() with id, name, type
    2D/
      Layout2D.ts          # Root container for 2D scenes
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
    BehaviorPickerService.ts
    CommandDispatcher.ts   # Primary entry point for all actions
    EditorTabService.ts    # Manages editor tabs (scenes, scripts, etc.)
    FileSystemAPIService.ts
    FocusRingService.ts
    IconService.ts         # Injectable service for managing scalable vector icons. Use `getIcon(name: string)` to retrieve icons. Ensure consistent usage across components for theming and scaling.
    index.ts
    OperationService.ts    # Executes operations; gateway for mutations
    ProjectScriptLoaderService.ts
    ProjectService.ts
    ResourceManager.ts
    ScriptCompilerService.ts  # Compiles project scripts
    ScriptCreatorService.ts   # Creates new script components
    ScriptExecutionService.ts
    ScriptRegistry.ts       # Registry for behaviors and controllers
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
      inspector-panel.ts          # Dynamic property rendering based on schemas; grid layout for Transform group; Scripts & Behaviors section
      inspector-panel.ts.css      # transform-fields grid, color-coded X/Y/Z labels
      property-editors.ts         # Vector2Editor, Vector3Editor, EulerEditor Web Components
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
      editor-tab.ts               # Container for viewport and toolbar within a tab
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
- Prefer reactive subscriptions over fixed polling loops for app-state synchronization

## Key Integration Points

- **Golden Layout**: Panel management
- **File System Access API**: Direct project access
- **Valtio**: Reactive state with automatic UI updates
- **Three.js**: Single-engine rendering with orthographic overlay
- **Plugin system**: Sandboxed extensions via manifest validation
- **Property Schema**: Dynamic inspector UI generation from node schemas

## Critical Rules for AI Agents

1. **Never mutate `appState` directly** — always use Operations via OperationService
2. **Follow operations-first model** — Operations handle all mutations, Commands are thin wrappers
3. **Use CommandDispatcher Service for all actions** — All UI and tools must perform actions via Commands through CommandDispatcher instead of directly invoking operations
4. **Nodes are NOT reactive state** — they live in `SceneGraph` (managed by `SceneManager`), not `appState`. State tracks node IDs for selection/hierarchy reference only
5. **Use ComponentBase** for all Lit components, not LitElement directly
6. **Import from `@/` aliases** — never use relative paths for core imports
7. **Separate styles** — each component has corresponding `.css` file
8. **Centralized accent color** — use CSS custom properties `--pix3-accent-color` (#ffcf33) and `--pix3-accent-rgb` (255, 207, 51) instead of hardcoded orange values in all UI CSS. Apply to buttons, dropdowns, panels, tabs, menus, and interactive states using `rgba(var(--pix3-accent-rgb), opacity)` for flexibility.
9. **Light DOM by default** — use shadow DOM only when explicitly needed
10. **Singleton services** — register with ServiceContainer, implement dispose()
11. **Cross-reference specification** — check `docs/pix3-specification.md` for architectural decisions
12. **Avoid bloat documentation** — Only maintain README.md, AGENTS.md, architecture.md, pix3-specification.md in docs/. Keep documentation minimal and focused on active development. **Do NOT create separate .md files for specific features or refactors**—integrate essential information directly into existing documentation files or README.md instead.
13. **Property schemas define node properties** — Node classes must implement `static getPropertySchema()`. Inspector consumes via `getNodePropertySchema()`. Schema's getValue/setValue handle all property access and transformation (e.g., radian/degree conversion).
14. **Unified component system** — All scripts are `ScriptComponent` instances. Use `Script` base class for new components. Use `node.addComponent()`, `node.removeComponent()`, `node.getComponent<T>()` for component management. Legacy `behaviors`/`controller` APIs maintained for backward compatibility.
15. **Never use `any` types** — Always provide explicit types. When dealing with external libraries or dynamic structures, use `unknown` with type guards or cast to specific interfaces/types. This prevents `@typescript-eslint/no-explicit-any` lint errors and improves type safety.
16. **Never infer created node IDs from root-node array order** — use selection-based extraction (`getCreatedNodeIdFromSelection`) after successful create operations.
17. **Script lifecycle teardown must be explicit** — stop/scene-switch paths must call component `onDetach()` and reset started state so `onStart()` runs on the next play session.
18. **Create-operation selection updates must include primary selection** — set both `nodeIds` and `primaryNodeId` on create and keep undo/redo selection cleanup symmetric.
19. **Portal-based UI for floating elements** — Always use `DropdownPortal` or similar portal pattern for floating UI elements like dropdowns, context menus, and tooltips. Never render these elements inline inside panel containers with `overflow: hidden/auto`, as they will be clipped. Render them at the `document.body` level via portals with `position: fixed` to ensure they appear on top of all other panels.
20. **Prefab override detection in inspector** — When rendering properties for nodes with prefab metadata, show base prefab values and allow users to revert overrides. Use `getPrefabMetadata()` and `findPrefabInstanceRoot()` to determine if a node is part of a prefab instance.

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
- For UWP target builds, avoid `F5`/`Shift+F5` command shortcuts (reserved for app refresh/debug flows)

### Browser Interaction

- Agents can use the `#mcp_chrome` MCP server to navigate pages, read logs and make screenshots. User already opened tab on current debug session.
- Prefer adding console logs over using screenshots.
- Never launch URLs directly; use MCP to navigate to necessary pages. Never open simple browser.
- Logs and snapshots can be read using the MCP browser tools.

### Default Scene Loading

- After the page is refreshed, the agent should click on the first recent project in the list to load the default scene.

### Scene Reload Debugging

- When diagnosing scene reload failures after save operations, check:
  - `ReloadSceneOperation.ts`: Logs file content size and preview when reading
  - `SceneLoader.ts`: Logs YAML parse start with content preview; logs if parser returns null with diagnostic details
  - Look for race conditions in file write timing or content encoding issues
  - File watch service (`FileWatchService`) detects external changes via polling and triggers `ReloadSceneCommand`
  - `pix3-editor-shell.ts` `handleFileChanged()` executes reload and logs errors
- These debugging logs help identify whether issues are in file I/O, YAML parsing, or timing
