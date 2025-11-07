# Pix3 — Technical Specification

Version: 1.9

Date: 2025-10-27

## 1. Introduction

### 1.1 Purpose of the Document

This document describes the technical requirements, architecture, and development plan for the web application Pix3 — a modern editor for creating HTML5 games that combines 2D and 3D capabilities.

### 1.2 Product Overview

Pix3 is a browser-based editor, similar to Figma and Unity, designed for rapid and iterative development of game scenes. It allows working with project files directly through the File System Access API, ensuring tight integration with external IDEs (like VS Code) for code editing.

### 1.3 Target Audience

Pix3 targets professional and indie teams who already create playable ads and interactive experiences with WebGL engines:

- **Playable ad creators** migrating from PixiJS and Three.js pipelines who need scene tooling and rapid iteration.
- **Construct 3 and Godot users** looking for a browser-first workflow with minimal install friction.
- **Cocos and custom engine developers** who want to assemble UI overlays and scene flow visually before exporting to code.

Success metrics:

- Create a new playable ad scene from template to export in under 30 minutes on mid-tier hardware.
- Maintain ≥ 85% editor FPS on a 3-layer (UI + 3D + particle) scene in Chromium browsers on 2023+ laptops.
- Support 90% of user actions via keyboard shortcuts or palette commands within MVP.

### 1.4 Document Scope and Change Management

This specification covers the MVP scope and foundation architecture. Changes are tracked in the changelog at the end of the document. Version 1.5 incorporates target browser alignment, extended non-functional requirements, and deeper architectural guidance.

## 2. Key Features

- Hybrid 2D/3D Scene: The editor does not have a rigid separation between 2D and 3D modes. Instead, it uses a layer system, allowing 2D interfaces to be overlaid on top of 3D scenes — ideal for creating game UIs.
- Godot-style Scene Structure: The scene architecture is based on a hierarchy of "nodes." Each node represents an object (a sprite, a 3D model, a light source). Nodes can be saved into separate scene files (*.pix3scene) and reused (instanced) within other scenes.
- Local File System Integration: Pix3 works directly with the project folder on the user's disk via the File System Access API. This eliminates the need to upload/download files and provides seamless synchronization with external code editors.
- Multi-tab Interface: Users can open and edit multiple scenes in different tabs simultaneously, simplifying work on complex projects.
- Drag-and-Drop Assets: Project resources (images, models) can be dragged directly from the editor's file browser into the scene viewport to create nodes.
- Customizable Interface: The user can move and dock editor panels to different areas of the window, similar to VS Code, and save their layout between sessions.
- Workspace Presets: Provide opinionated workspace presets (Playable Ad, 3D Scene Authoring, UI Overlay).

## 3. Technology Stack

| Category           | Technology                  | Justification |
|-------------------:|:---------------------------|:--------------|
| UI Components      | Lit + fw utilities         | A lightweight library for creating fast, native, and encapsulated web components. Use the project `fw` helpers (`ComponentBase`, `inject`, and related exports) as the default building blocks for UI components instead of raw LitElement to simplify configuration (light vs shadow DOM), dependency injection, and consistency across the codebase.
| State Management   | Valtio                     | An ultra-lightweight, high-performance state manager based on proxies. Ensures reactivity and is easy to use.
| Rendering (MVP)    | Three.js                   | Single engine for both 3D (perspective) and 2D (orthographic) layers to minimize bundle size for playable ads.
| 2D Overlays        | Three.js (orthographic)    | Orthographic camera + sprite/material system handles HUD & UI layers without second engine.
| Panel Layout       | Golden Layout              | A ready-made solution for creating complex, customizable, and persistent panel layouts.
| Language           | TypeScript                 | Strong typing to increase reliability, improve autocompletion, and simplify work with AI agents.
| Build Tool         | Vite                       | A modern and extremely fast build tool, perfectly suited for development with native web technologies.
| File System        | File System Access API     | Allows working with local files directly from the browser without needing Electron.

### 3.1 Target Platforms

- **Browsers:** Chromium-based desktop browsers (Chrome, Edge, Arc, Brave) latest two stable versions.
- **Operating Systems:** Windows 11+, macOS 13+, Ubuntu 22.04+ (via Chromium).
- **Hardware Baseline:** Integrated GPU (Intel Iris Xe / AMD Vega) with WebGL2 support, 8 GB RAM, 4-core CPU.

Non-Chromium browsers (Firefox, Safari) are out of scope for MVP but should degrade gracefully by displaying a compatibility banner.

## 4. Architecture

The application will be built on the principles of unidirectional data flow and clear separation of concerns.

- **State**: A centralized Valtio proxy (`appState`), serving as the single source of truth for UI, scenes metadata, and selection. It is passive and contains no business logic.
- **Nodes**: Scene nodes (inheriting from Three.js Object3D) are managed by `SceneManager` in `SceneGraph` objects. **Nodes are not stored in reactive state** — only node IDs are tracked in state for selection and hierarchy reference. This separation reduces reactivity overhead and keeps node mutations fast.
- **Operations**: First-class objects encapsulating business logic and state mutations. The `OperationService` is the gateway for executing operations, but all actions must be initiated via **Commands** through the `CommandDispatcher` Service.
- **Commands**: Thin wrappers that validate context (`preconditions()`) and invoke operations via `OperationService`. Commands are registered and discovered via metadata for the command palette. Commands never implement their own undo/redo.
- **CommandDispatcher**: Primary entry point for all user actions. Ensures consistent lifecycle management, preconditions checking, and telemetry for all commands.
- **Command Metadata**: Commands declare menu integration via metadata properties: `menuPath` (menu section), `shortcut` (display), and `addToMenu` (inclusion flag). Menu is generated from registered commands, not hardcoded.
- **Core Managers**: Classes that orchestrate the main aspects of the editor (HistoryManager, SceneManager, LayoutManager). They manage their respective domains and emit events.
- **Services**: Infrastructure layer for interacting with the outside world (FileSystemAPIService, ViewportRenderService). They implement `dispose()` and are registered with DI.
- **UI Components**: "Dumb" components extending `ComponentBase` from `src/fw`. They subscribe to state changes, render based on snapshots, and dispatch commands via CommandDispatcher rather than mutating state directly.
- **Message Bus**: Optional typed pub/sub for bridging state updates, commands, and plugins without tight coupling.

### Recommended component pattern

Use the `fw` utilities exported from `docs/fw/index.ts` when creating UI components. Example:

```typescript
import { customElement, html, css, property, ComponentBase, inject } from 'docs/fw';

@customElement('my-inspector')
export class MyInspector extends ComponentBase {
  @property({ type: String }) title = 'Inspector';

  @inject()
  dataService!: DataService; // resolved from fw/di container

  render() {
    return html`<div class="inspector"><h3>${this.title}</h3></div>`;
  }
}
```

Notes:
- `ComponentBase` defaults to light DOM but allows opting into shadow DOM via a static `useShadowDom` flag.
- The `inject` decorator automatically resolves services registered with the `fw/di` container. Services can be registered using the `@injectable()` helper in `fw/di`. Ensure `emitDecoratorMetadata` and `reflect-metadata` are enabled within the build configuration.
- Plugins: An extensible mechanism that allows adding new functionality (tools, panels, commands) without modifying the core editor.

### 4.1 Core Architecture Contracts

- **Operation Lifecycle (source of truth):** An operation implements `perform(context)` and returns an `OperationCommit` object containing closures for `undo()`/`redo()` and metadata for coalescing. OperationService executes operations, pushes commits to history when requested, emits telemetry, and is solely responsible for undo/redo.
- **Command Lifecycle (thin wrappers):** `preconditions()` → `execute()`; commands delegate to OperationService to invoke operations and never implement their own undo/redo. They remain idempotent and emit telemetry via OperationService.
- **SceneGraph & Node Lifecycle:** `SceneManager` owns a `SceneGraph` per loaded scene. Each `SceneGraph` contains a `nodeMap` (for fast lookup) and `rootNodes` array. Nodes extend Three.js `Object3D` and are **not stored in Valtio state**. State only maintains node IDs for selection and hierarchy reference via `SceneHierarchyState.rootNodes`.
- **HistoryManager Contract:** Maintains a bounded stack of command snapshots, integrates with collaborative locking, and exposes `canUndo`/`canRedo` signals to the UI.
- **PluginManager Contract:** Discovers plugins (`manifest.json` with `capabilities`), validates signatures, and sandboxes command registrations per namespace.
- **Service Layer:** Services implement `dispose()` and must be registered via DI. Singleton services load lazily on first injection.
- **CommandDispatcher Contract:** Executes all commands; invokes preconditions, executes, and handles telemetry. All user actions route through CommandDispatcher.

### 4.2 Glossary

- **Node:** Atomic element in the scene graph representing an entity (sprite, mesh, light).
- **Scene:** YAML document describing root node hierarchy and references.
- **Instance:** Inclusion of another scene file inside the active scene with optional overrides.
- **Preset:** Saved layout configuration.
- **Command:** Unit of business logic that mutates the state and can be undone/redone.

### 4.3 Operations-first Pipeline

- **OperationService:** Central orchestrator for operations. Methods: `invoke(op)`, `invokeAndPush(op)` (also record history), `undo()`, `redo()`. Maintains bounded stacks (default 100 items), clears redo on new pushes, supports coalescing, and emits typed events for UI updates and telemetry.
- **Operation Contract:** `perform()` returns an `OperationCommit` with `undo`/`redo` closures. Optionally includes metadata like affected node IDs and structure flags for efficient scene diffing.
- **Bulk operations:** Tools can compose granular operations into one undo step via a helper that produces a single coalesced commit.
- **CommandDispatcher:** Primary entry point for all actions. All UI panels and tools must use CommandDispatcher to execute commands, ensuring consistent lifecycle management, preconditions checking, and telemetry. Direct invocation of operations via OperationService is discouraged and should be replaced with appropriate commands.
- **Telemetry Hooks:** All mutations flow through OperationService, making it the ideal hook for analytics, autosave, and sync.

### 4.4 Rendering Architecture Notes

- **Single Engine:** All rendering (3D + 2D) is handled by Three.js to minimize complexity and bundle size. 2D overlays (HUD, selection outlines, gizmos) use an orthographic camera and sprite/material abstractions.
- **Layer Separation:** Logical separation is maintained via internal render phases (viewport pass, overlay pass) rather than different engines. This keeps the API stable and simplifies debugging.
- **Extensibility:** If a future dedicated 2D engine integration is ever reconsidered, it would plug in behind the same abstract interfaces (`ViewportRendererService` style facade). For now this is explicitly out of scope and removed from roadmap.
- **Testing Path:** Planned integration tests will validate resize, DPR scaling, and render ordering across the two passes using the single-engine pipeline.

## Implementation status (current repository state)

The repository contains a working MVP scaffold with a functional rendering pipeline and operations-first architecture. The list below summarizes concrete items already implemented and points to primary files for reference.

### Implemented Features

- **Architecture Foundation**: Operations-first pattern with OperationService as the gateway. Commands are thin wrappers delegating to operations. CommandDispatcher Service is the primary entry point for all actions. All UI and tools use Commands via CommandDispatcher for consistent lifecycle management, preconditions checking, and telemetry.
- **State Management**: Valtio-based AppState containing UI state, scenes metadata (file paths, names, load states), selection (node IDs), and operation metadata. Nodes are explicitly NOT stored in reactive state.
- **SceneGraph & Node Lifecycle**: `SceneManager` owns `SceneGraph` objects per scene. Each graph contains a `nodeMap` (fast lookup by ID) and `rootNodes` array. Nodes extend Three.js `Object3D` and are purely data/logic structures. State only tracks node IDs for selection and hierarchy UI consumption.
- **Dependency Injection**: Custom DI container with `@injectable()` and `@inject()` decorators. Services implement `dispose()` and are registered with `ServiceContainer` (singleton by default). `ComponentBase` provides consistent `@inject()` support.
- **Viewport Rendering**: Three.js-based `ViewportRenderService` with perspective pass (3D) plus orthographic overlay pass (HUD/gizmos). DPR-aware resize handling with ResizeObserver. Orbit controls and demo scene included.
- **Scene Parsing & Validation**: `SceneManager` parses `.pix3scene` YAML files and validates with AJV. Type-safe error handling for validation failures.
- **Build & Dev Tooling**: Vite + TypeScript project with ESLint, Prettier, Vitest, and CI workflows. Dev (`npm run dev`), build (`npm run build`), test (`npm run test`), and lint scripts functional.
- **UI Components**: Golden Layout-based shell. Panels (Scene Tree, Viewport, Inspector, Asset Browser) implemented with `ComponentBase`. All components extend `ComponentBase` and use light DOM by default. Styles separated into `[component].ts.css` files.
- **Command Execution**: Features implemented for selection (SelectObjectCommand/Operation), scene loading (LoadSceneCommand), and history (RedoCommand/UndoCommand). All use Operations via OperationService and CommandDispatcher.

### Known Gaps / Next Work Items

- **Tests**: Unit tests exist for core managers and commands. Integration tests for renderer DPR/resize behavior would strengthen confidence.
- **Performance Tuning**: Production build has chunk-size warnings. Code-splitting large optional modules would reduce initial bundle size.
- **Fixed-Pixel Overlays**: If pixel-perfect UI chrome or guides are needed, a small helper to compute orthographic bounds from screen pixels could be added.
- **Plugin System**: Plugin manifest validation and sandboxing are on the roadmap but not yet implemented.
- **Collaborative Features**: Shared sessions and live cursors (post-MVP).

## 5. Scene File Format (*.pix3scene)

The scene file will use the YAML format to ensure readability for both humans and machines (including AI agents).

### 5.1 Key Principles

- Declarative: The file describes the composition and structure of the scene, not the process of its creation.
- Asset Referencing: Assets (models, textures) are not embedded in the file but are referenced via relative paths with a res:// prefix (path from the project root).
- Composition: Complex scenes are assembled from simpler ones by instantiating other scene files.
- Unambiguous Structure: An explicit children key is used to denote the list of child nodes, which separates the hierarchy from the properties of the node itself.
- Unique Identification: Every node must have an id field. The value is a short, cryptographically secure unique identifier (similar to Nano ID) to provide a balance between file readability and the absolute reliability of references.
- Versioned Schema: Each file includes a `version` field; migrations are maintained in the SceneManager and run automatically on load.
- Conflict Resolution: Instance overrides always win over parent definitions. Duplicate IDs trigger validation errors during import.

### 5.2 Example Structure

```yaml
# --- Metadata ---
version: 1.0
description: "Main scene for the first level"

# --- Node Hierarchy ---
root:
  # Each node has a unique ID, type, name, and properties
  - id: "V1StGXR8_Z5jdHi6B-myT"
    type: "Node3D"
    name: "World"
    properties:
      position: { x: 0, y: 0, z: 0 }
      rotation: { x: 0, y: 0, z: 0 }

    # Explicit definition of child nodes for clarity
    children:
      - id: "b-s_1Z-4f8_c-9T_2f-3d"
        # Instance of another scene (prefab)
        instance: "res://scenes/player.pix3scene"
        name: "Player"
        properties:
          # Overriding instance properties
          position: { x: 0, y: 1, z: 5 }

      - id: "k-9f_8g-7h_6j-5k_4l-1"
        type: "MeshInstance3D"
        name: "Ground"
        properties:
          # Reference to an asset
          mesh: "res://assets/models/ground_plane.glb"
          scale: { x: 100, y: 1, z: 100 }
```

### 5.3 Validation Rules

- The root section must contain at least one node entry.
- All node IDs must be unique across the entire resolved scene graph.
- `instance` entries must point to existing `.pix3scene` files; SceneManager resolves relative to project root.
- Optional `metadata` block can include analytics tags, localization keys, and QA notes.
- Continuous integration should run schema validation (AJV + generated JSON schema) against committed scene files.

## 6. MVP (Minimum Viable Product) Plan

- Establish Vite + TypeScript + Lit project with ESLint, Prettier, Vitest, and CI lint/test workflows.
- Implement the basic architecture: AppState with Valtio, Command pattern contracts, and DI container wiring.
- Integrate FileSystemAPIService to open a project folder, list assets, and load `.pix3scene` files.
- Integrate Golden Layout to create a basic layout: Scene Tree, Viewport, Inspector, Asset Browser. Provide layout presets.
- Implement rendering of a simple 3D scene in the viewport using Three.js, including an orthographic pass for 2D overlays (single-engine pipeline).
- Create SceneManager to parse and display the scene structure (`*.pix3scene`) and expose diff events.
- Implement the `pix3-basic-tools-plugin` to add a tool for creating primitives (e.g., a cube) with undoable commands.
- Implement a basic Undo/Redo system using HistoryManager, wired to keyboard shortcuts and UI controls.
- Deliver a playable-ad export preset (HTML bundle) and analytics logging stub.

## 7. Non-Functional Requirements

- **Performance:** Maintain ≥ 85 FPS in viewport on baseline hardware. Initial load (cold) < 6s, warm reload < 2s. Command execution should visually update UI within 80ms.
- **Accessibility:** WCAG 2.1 AA minimum for editor chrome; ensure keyboard navigation for panel focus and command palette. Provide high-contrast theme preset.
- **Security & Privacy:** Avoid storing project contents on Pix3 servers. Request File System Access permissions per session and cache handles using IndexedDB with user consent. Plugins run in isolated workers and require explicit permission to access services.
- **Reliability:** Autosave layout and session state every 30 seconds. Maintain undo history for at least the last 100 commands.
- **Internationalization:** UI copy uses i18n keys; English and Russian shipped at MVP. YAML scenes may include localized strings via `locale` blocks.

## 8. Project Structure

```
/
├── dist/                     # Build output (generated)
├── public/                   # Static assets (logo, icons)
├── src/
│   ├── core/                 # Core business logic and managers
│   │   ├── AssetLoader.ts
│   │   ├── BulkOperation.ts
│   │   ├── command.ts        # Command/Operation base contracts
│   │   ├── HistoryManager.ts
│   │   ├── LayoutManager.ts
│   │   ├── Operation.ts
│   │   ├── SceneLoader.ts
│   │   └── SceneManager.ts   # Owns SceneGraph and Node lifecycle (non-reactive)
│   ├── features/             # Feature-specific commands and operations
│   │   ├── history/
│   │   │   ├── RedoCommand.ts
│   │   │   └── UndoCommand.ts
│   │   ├── properties/
│   │   │   ├── UpdateObjectPropertyCommand.ts
│   │   │   └── UpdateObjectPropertyOperation.ts
│   │   ├── scene/
│   │   │   └── LoadSceneCommand.ts
│   │   └── selection/
│   │       ├── SelectObjectCommand.ts
│   │       └── SelectObjectOperation.ts
│   ├── fw/                   # Framework utilities (ComponentBase, DI, helpers)
│   │   ├── component-base.ts # Extends LitElement with light DOM default
│   │   ├── di.ts             # Dependency injection container
│   │   ├── from-query.ts
│   │   ├── index.ts
│   │   └── layout-component-base.ts
│   ├── nodes/                # Node definitions (NOT in reactive state)
│   │   ├── Node2D.ts
│   │   ├── Node3D.ts
│   │   ├── NodeBase.ts       # Extends Three.js Object3D; purely data/logic
│   │   ├── 2D/
│   │   │   └── Sprite2D.ts
│   │   └── 3D/
│   │       ├── Camera3D.ts
│   │       ├── DirectionalLightNode.ts
│   │       ├── GeometryMesh.ts
│   │       ├── GlbModel.ts
│   │       └── MeshInstance.ts
│   ├── services/             # Injectable services
│   │   ├── AssetFileActivationService.ts
│   │   ├── AssetLoaderService.ts
│   │   ├── CommandDispatcher.ts  # Primary entry point for all actions
│   │   ├── FileSystemAPIService.ts
│   │   ├── FocusRingService.ts
│   │   ├── index.ts
│   │   ├── OperationService.ts   # Executes operations; gateway for mutations
│   │   ├── ProjectService.ts
│   │   ├── ResourceManager.ts
│   │   ├── TemplateService.ts
│   │   └── ViewportRenderService.ts
│   ├── state/                # Valtio app state definitions (UI, metadata, selection only)
│   │   ├── AppState.ts       # Defines reactive state shape; no Nodes here
│   │   └── index.ts
│   ├── templates/            # Project templates
│   │   ├── pix3-logo.png
│   │   ├── startup-scene.pix3scene
│   │   └── test_model.glb
│   ├── ui/                   # Lit components extending ComponentBase
│   │   ├── pix3-editor-shell.ts
│   │   ├── pix3-editor-shell.ts.css
│   │   ├── assets-browser/
│   │   │   ├── asset-browser-panel.ts
│   │   │   ├── asset-browser-panel.ts.css
│   │   │   ├── asset-tree.ts
│   │   │   └── asset-tree.ts.css
│   │   ├── object-inspector/
│   │   │   ├── inspector-panel.ts
│   │   │   └── inspector-panel.ts.css
│   │   ├── scene-tree/
│   │   │   ├── node-visuals.helper.ts
│   │   │   ├── scene-tree-node.ts
│   │   │   ├── scene-tree-node.ts.css
│   │   │   ├── scene-tree-panel.ts
│   │   │   └── scene-tree-panel.ts.css
│   │   ├── shared/
│   │   │   ├── pix3-panel.ts
│   │   │   ├── pix3-panel.ts.css
│   │   │   ├── pix3-toolbar-button.ts
│   │   │   ├── pix3-toolbar-button.ts.css
│   │   │   ├── pix3-toolbar.ts
│   │   │   └── pix3-toolbar.ts.css
│   │   ├── viewport/
│   │   │   ├── viewport-panel.ts
│   │   │   └── viewport-panel.ts.css
│   │   └── welcome/
│   │       ├── pix3-welcome.ts
│   │       └── pix3-welcome.ts.css
```

## 9. Roadmap and Milestones

1. **Milestone 0 — Foundation (4 weeks):** Repo bootstrap, DI utilities, layout shell, state scaffolding, CI pipeline.
2. **Milestone 1 — Scene Authoring (6 weeks):** SceneManager MVP, viewport rendering loop, asset browser, primitive tools.
3. **Milestone 2 — Playable Export (4 weeks):** Export preset, analytics stub, undo/redo polish, plugin SDK docs.
4. **Milestone 3 — Collaboration Preview (future):** Shared sessions, commenting, live cursors (post-MVP).

## 10. Change Log

- **1.5 (2025-09-26):** Added target platforms, non-functional requirements, detailed architecture contracts, validation rules, and roadmap updates. Synced guidance on `fw` helpers.
- **1.7 (2025-10-01):** Removed PixiJS dual-engine plan; consolidated rendering to single Three.js pipeline (perspective + orthographic). Updated project structure, removed obsolete adapter references, clarified rendering notes.
- **1.8 (2025-10-05):** Adopted operations-first model. Commands are thin wrappers that delegate to `OperationService`. UI invokes operations directly. Code organized into `core/features/*/{commands,operations}`. Deprecated `CommandOperationAdapter` in documentation.
- **1.9 (2025-10-27):** Updated to reflect current architecture where Nodes are NOT in reactive state. Nodes are managed by SceneManager in SceneGraph objects. State contains only UI, scenes metadata, and selection IDs. CommandDispatcher Service is the primary entry point for all actions. Updated project structure section to annotate (non-reactive) for nodes and clarify state boundaries. Enhanced implementation status with current feature list.

## 11. Plugin State Management

Plugins in Pix3 can manage their own state, separate from the core application state. This allows for greater flexibility and encapsulation of functionality. Each plugin can define its own state structure and management logic, using Valtio or any other preferred state management solution.

### 11.1 Plugin State Lifecycle

- **Initialization:** Plugins can initialize their state when they are loaded. This is the ideal time to set up default values and prepare any necessary data structures.
- **Updates:** Plugins should respond to relevant events or commands to update their state. This can include external events (e.g., file changes) or internal events (e.g., user actions).
- **Persistence:** Plugins can persist their state to local storage or other storage solutions as needed. This allows users to maintain their settings and data across sessions.
- **Disposal:** When a plugin is unloaded, it should clean up any resources, listeners, or intervals it has created. This prevents memory leaks and ensures that the application remains performant.

### 11.2 Example Plugin State Management

```typescript
import { proxy, subscribe } from 'valtio';

// Define the plugin state
const pluginState = proxy({
  count: 0,
  text: 'Hello Pix3',
});

// Subscribe to state changes
subscribe(pluginState, () => {
  console.log('Plugin state updated:', pluginState);
});

// Update the state
pluginState.count += 1;
pluginState.text = 'Updated text';
```

### 11.3 Best Practices

- Keep the plugin state isolated from the core application state to avoid unintended side effects.
- Use descriptive and consistent naming for state properties to ensure clarity and maintainability.
- Document the state structure and any important logic to assist other developers (and your future self).
- Consider performance implications when designing the state management logic, especially for large or complex states.
