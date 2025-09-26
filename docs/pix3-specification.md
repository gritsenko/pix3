# Pix3 — Technical Specification

Version: 1.5

Date: 2025-09-26

## 1. Introduction

### 1.1 Purpose of the Document

This document describes the technical requirements, architecture, and development plan for the web application Pix3 — a modern editor for creating HTML5 games that combines 2D and 3D capabilities.

### 1.2 Product Overview

Pix3 is a browser-based editor, similar to Figma and Unity, designed for rapid and iterative development of game scenes. It allows working with project files directly through the File System Access API, ensuring tight integration with external IDEs (like VS Code) for code editing.

### 1.3 Target Audience and Personas

Pix3 targets professional and indie teams who already create playable ads and interactive experiences with WebGL engines:

- **Playable ad creators** migrating from PixiJS and Three.js pipelines who need scene tooling and rapid iteration.
- **Construct 3 and Godot users** looking for a browser-first workflow with minimal install friction.
- **Cocos and custom engine developers** who want to assemble UI overlays and scene flow visually before exporting to code.

Primary personas:

1. **Technical Artist (TA):** Owns scene composition, expects drag-and-drop asset flow, configurable layouts, and undo safety. Works cross-functionally with engineers providing shaders and scripts.
2. **Gameplay Engineer (GE):** Implements commands and plugins, needs a well-documented API, dependency injection, and TypeScript-first tooling.
3. **Playable Ad Producer (PAP):** Focused on iteration speed, expects single-click previews, analytics hooks, and export presets for ad networks.

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
- Workspace Presets: Provide opinionated workspace presets (Playable Ad, 3D Scene Authoring, UI Overlay) to match the primary personas.

## 3. Technology Stack

| Category           | Technology                  | Justification |
|-------------------:|:---------------------------|:--------------|
| UI Components      | Lit + fw utilities         | A lightweight library for creating fast, native, and encapsulated web components. Use the project `fw` helpers (`ComponentBase`, `inject`, and related exports) as the default building blocks for UI components instead of raw LitElement to simplify configuration (light vs shadow DOM), dependency injection, and consistency across the codebase.
| State Management   | Valtio                     | An ultra-lightweight, high-performance state manager based on proxies. Ensures reactivity and is easy to use.
| 2D Rendering       | PixiJS                     | A high-performance 2D renderer that automatically uses WebGL.
| 3D Rendering       | Three.js                   | The most popular and flexible library for 3D graphics on the web.
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

- State: A centralized store based on Valtio, serving as the single source of truth. It is passive and contains no business logic.
- Commands (Operations): Small, isolated classes containing all business logic. Only they are allowed to modify the State. This pattern is the foundation for the Undo/Redo system.
- Core Managers: Classes that manage the main aspects of the editor (HistoryManager, SceneManager, PluginManager). They orchestrate the execution of commands.
- Services: An infrastructure layer for interacting with the outside world (FileSystemAPIService). They do not contain business logic.
- UI Components: "Dumb" components built on top of the project's fw helpers. Prefer extending `ComponentBase` (which wraps LitElement and provides a configurable render root) and use the `inject` decorator from `fw/di` for services instead of wiring dependencies manually. This ensures consistent DOM mode (light vs shadow), simpler service wiring, and a single recommended pattern across the project.
- Message Bus: A lightweight pub/sub bus to bridge state updates, commands, and plugins without coupling. Commands emit events describing mutations; UI components subscribe via typed channels.

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

- **Command Lifecycle:** `preconditions()` → `execute()` → `postCommit()` with undo payload returned. Commands must be idempotent and report telemetry events.
- **HistoryManager Contract:** Maintains a bounded stack of command snapshots, integrates with collaborative locking, and exposes `canUndo`/`canRedo` signals to the UI.
- **SceneManager Contract:** Responsible for parsing `.pix3scene` files, resolving instances, applying overrides, and emitting change diffs for viewport renderers.
- **PluginManager Contract:** Discovers plugins (`manifest.json` with `capabilities`), validates signatures, and sandboxes command registrations per namespace.
- **Service Layer:** Services implement `dispose()` and must be registered via DI. Singleton services load lazily on first injection.

### 4.2 Glossary

- **Node:** Atomic element in the scene graph representing an entity (sprite, mesh, light).
- **Scene:** YAML document describing root node hierarchy and references.
- **Instance:** Inclusion of another scene file inside the active scene with optional overrides.
- **Preset:** Saved layout configuration tailored to a persona’s workflow.
- **Command:** Unit of business logic that mutates the state and can be undone/redone.

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
- Integrate Golden Layout to create a basic layout: Scene Tree, Viewport, Inspector, Asset Browser. Provide persona presets.
- Implement rendering of a simple 3D scene in the viewport using Three.js. Provide a 2D overlay via PixiJS for UI.
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
├── dist/                     # Folder for the compiled application
├── public/                   # Static assets (icons, fonts)
├── src/
│   ├── components/           # UI Components (panels, buttons, inspectors)
│   │   ├── inspector/
│   │   │   └── inspector-panel.ts
│   │   ├── scene/
│   │   │   └── scene-tree.ts
│   │   └── viewport/
│   │       └── viewport-component.ts
│   │
│   ├── core/                 # Application core (main business logic)
│   │   ├── commands/         # Command pattern for all actions
│   │   │   └── command.ts    # Base class/interface for commands
│   │   ├── history/
│   │   │   └── HistoryManager.ts # Undo/Redo Manager
│   │   ├── layout/
│   │   │   └── LayoutManager.ts  # Panel management (Golden Layout)
│   │   ├── plugins/
│   │   │   └── PluginManager.ts  # Loads and manages plugins
│   │   └── scene/
│   │       ├── nodes/          # Classes for each node type
│   │       │   ├── NodeBase.ts
│   │       │   ├── Node3D.ts
│   │       │   └── Sprite2D.ts
│   │       ├── SceneManager.ts # Manages the scene and nodes
│   │       └── types.ts      # Type aggregator, exports classes from /nodes
│   │
│   ├── plugins/              # Folder for plugins
│   │   └── pix3-basic-tools-plugin/
│   │       ├── commands/
│   │       │   └── create-primitive.ts
│   │       ├── components/
│   │       │   └── tool-options.ts
│   │       └── pix3-basic-tools-plugin.ts # Main plugin file
│   
│   ├── services/             # Infrastructure services (interaction with the "outside world")
│   │   ├── FileSystemAPIService.ts
│   │   └── CollaborationService.ts (for the future)
│   
│   ├── state/                # Global application state
│   │   ├── AppState.ts       # State definition (with Valtio)
│   │   └── index.ts          # Exports the state proxy
│   
│   ├── rendering/            # Rendering logic (bridge to Three.js/PixiJS)
│   │   ├── WebGLRenderer.ts
│   │   └── Canvas2DRenderer.ts
│   │
│   ├── styles/               # Global styles
│   │   └── main.css
│   │
│   ├── utils/                # Helper functions
│   │
│   └── main.ts               # Application entry point

├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts

```

## 9. Roadmap and Milestones

1. **Milestone 0 — Foundation (4 weeks):** Repo bootstrap, DI utilities, layout shell, state scaffolding, CI pipeline.
2. **Milestone 1 — Scene Authoring (6 weeks):** SceneManager MVP, viewport rendering loop, asset browser, primitive tools.
3. **Milestone 2 — Playable Export (4 weeks):** Export preset, analytics stub, undo/redo polish, plugin SDK docs.
4. **Milestone 3 — Collaboration Preview (future):** Shared sessions, commenting, live cursors (post-MVP).

## 10. Change Log

- **1.5 (2025-09-26):** Added personas, target platforms, non-functional requirements, detailed architecture contracts, validation rules, and roadmap updates. Synced guidance on `fw` helpers.
