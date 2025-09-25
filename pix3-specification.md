# Pix3 — Technical Specification

Version: 1.4

Date: 2025-09-25

## 1. Introduction

### 1.1 Purpose of the Document

This document describes the technical requirements, architecture, and development plan for the web application Pix3 — a modern editor for creating HTML5 games that combines 2D and 3D capabilities.

### 1.2 Product Overview

Pix3 is a browser-based editor, similar to Figma and Unity, designed for rapid and iterative development of game scenes. It allows working with project files directly through the File System Access API, ensuring tight integration with external IDEs (like VS Code) for code editing.

## 2. Key Features

- Hybrid 2D/3D Scene: The editor does not have a rigid separation between 2D and 3D modes. Instead, it uses a layer system, allowing 2D interfaces to be overlaid on top of 3D scenes — ideal for creating game UIs.
- Godot-style Scene Structure: The scene architecture is based on a hierarchy of "nodes." Each node represents an object (a sprite, a 3D model, a light source). Nodes can be saved into separate scene files (*.pix3scene) and reused (instanced) within other scenes.
- Local File System Integration: Pix3 works directly with the project folder on the user's disk via the File System Access API. This eliminates the need to upload/download files and provides seamless synchronization with external code editors.
- Multi-tab Interface: Users can open and edit multiple scenes in different tabs simultaneously, simplifying work on complex projects.
- Drag-and-Drop Assets: Project resources (images, models) can be dragged directly from the editor's file browser into the scene viewport to create nodes.
- Customizable Interface: The user can move and dock editor panels to different areas of the window, similar to VS Code, and save their layout between sessions.

## 3. Technology Stack

| Category           | Technology                  | Justification |
|-------------------:|:---------------------------|:--------------|
| UI Components      | Lit                        | A lightweight library for creating fast, native, and encapsulated web components.
| State Management   | Valtio                     | An ultra-lightweight, high-performance state manager based on proxies. Ensures reactivity and is easy to use.
| 2D Rendering       | PixiJS                     | A high-performance 2D renderer that automatically uses WebGL.
| 3D Rendering       | Three.js                   | The most popular and flexible library for 3D graphics on the web.
| Panel Layout       | Golden Layout              | A ready-made solution for creating complex, customizable, and persistent panel layouts.
| Language           | TypeScript                 | Strong typing to increase reliability, improve autocompletion, and simplify work with AI agents.
| Build Tool         | Vite                       | A modern and extremely fast build tool, perfectly suited for development with native web technologies.
| File System        | File System Access API     | Allows working with local files directly from the browser without needing Electron.

## 4. Architecture

The application will be built on the principles of unidirectional data flow and clear separation of concerns.

- State: A centralized store based on Valtio, serving as the single source of truth. It is passive and contains no business logic.
- Commands (Operations): Small, isolated classes containing all business logic. Only they are allowed to modify the State. This pattern is the foundation for the Undo/Redo system.
- Core Managers: Classes that manage the main aspects of the editor (HistoryManager, SceneManager, PluginManager). They orchestrate the execution of commands.
- Services: An infrastructure layer for interacting with the outside world (FileSystemAPIService). They do not contain business logic.
- UI Components: "Dumb" Lit components that only display the State and trigger Commands in response to user actions.
- Plugins: An extensible mechanism that allows adding new functionality (tools, panels, commands) without modifying the core editor.

## 5. Scene File Format (*.pix3scene)

The scene file will use the YAML format to ensure readability for both humans and machines (including AI agents).

### 5.1 Key Principles

- Declarative: The file describes the composition and structure of the scene, not the process of its creation.
- Asset Referencing: Assets (models, textures) are not embedded in the file but are referenced via relative paths with a res:// prefix (path from the project root).
- Composition: Complex scenes are assembled from simpler ones by instantiating other scene files.
- Unambiguous Structure: An explicit children key is used to denote the list of child nodes, which separates the hierarchy from the properties of the node itself.
- Unique Identification: Every node must have an id field. The value is a short, cryptographically secure unique identifier (similar to Nano ID) to provide a balance between file readability and the absolute reliability of references.

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

## 6. MVP (Minimum Viable Product) Plan

- Set up the project with Vite, TypeScript, and Lit.
- Implement the basic architecture: AppState with Valtio, Command pattern.
- Integrate FileSystemAPIService to open a project folder and read files.
- Integrate Golden Layout to create a basic layout: Scene Tree, Viewport, Inspector, Asset Browser.
- Implement rendering of a simple 3D scene in the viewport using Three.js.
- Create SceneManager to parse and display the scene structure (*.pix3scene).
- Implement the pix3-basic-tools-plugin to add a tool for creating primitives (e.g., a cube).
- Implement a basic Undo/Redo system using HistoryManager.

## 7. Project Structure

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
