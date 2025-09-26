# Pix3 Project Initial Setup Todo

This document outlines the steps to create the initial project structure and implement the Minimum Viable Product (MVP) for Pix3, based on the technical specification.

## Prerequisites

- Target Chromium-based browsers (Chrome, Edge, Arc, Brave) — keep the last two stable versions installed for QA.
- Work on Windows 11+, macOS 13+, or Ubuntu 22.04+ hardware with at least an Intel Iris Xe / AMD Vega GPU and 8 GB RAM.
- Ensure TypeScript `experimentalDecorators` and `emitDecoratorMetadata` are enabled to support the DI utilities.
- Install tooling: Node.js 18+, npm 9+, Git, AJV CLI (or equivalent) for YAML validation.

## Project Setup

- [ ] Initialize project with Vite, TypeScript, and Lit
  - [ ] Create new Vite project: `npm create vite@latest pix3 -- --template lit-ts`
  - [ ] Install core dependencies: Valtio, Three.js, PixiJS, Golden Layout
  - [ ] Configure TypeScript for strict mode and path aliases
  - [ ] Set up basic project structure (folders and placeholder files)

## Core Architecture Implementation

- [ ] Implement basic architecture: AppState with Valtio
  - [ ] Create `src/state/AppState.ts` with Valtio proxy
  - [ ] Create `src/state/index.ts` to export the state proxy
  - [ ] Define initial state structure for scenes, layout, etc.

- [ ] Implement Command pattern
  - [ ] Create `src/core/commands/command.ts` (base class/interface)
  - [ ] Create basic command classes for scene operations
  - [ ] Set up command execution system
  - [ ] Emit telemetry events and undo payloads from each command implementation

## Services Layer

- [ ] Implement FileSystemAPIService
  - [ ] Create `src/services/FileSystemAPIService.ts`
  - [ ] Implement project folder opening functionality
  - [ ] Implement file reading/writing operations
  - [ ] Add error handling for browser compatibility

## UI and Layout

- [ ] Integrate Golden Layout
  - [ ] Install and configure Golden Layout
  - [ ] Create `src/core/layout/LayoutManager.ts`
  - [ ] Implement basic panel layout: Scene Tree, Viewport, Inspector, Asset Browser

- [ ] Create basic UI components
  - [ ] Create `src/components/viewport/viewport-component.ts`
  - [ ] Create `src/components/scene/scene-tree.ts`
  - [ ] Create `src/components/inspector/inspector-panel.ts`
  - [ ] Create basic asset browser component
  - [ ] Prefer `ComponentBase` and `fw/di` for new components
    - [ ] Use `ComponentBase` instead of `LitElement` to opt into the project's default DOM mode and lifecycle tweaks
    - [ ] Use `inject` from `fw/di` to resolve services in components
    - [ ] Ship workspace layout presets (Playable Ad, 3D Scene Authoring, UI Overlay) and allow switching via settings

## Rendering System

- [ ] Implement 3D rendering with Three.js
  - [ ] Create `src/rendering/WebGLRenderer.ts`
  - [ ] Set up basic 3D scene in viewport
  - [ ] Add camera controls and basic lighting

- [ ] Prepare for 2D rendering (PixiJS)
  - [ ] Create `src/rendering/Canvas2DRenderer.ts` (placeholder)
  - [ ] Plan integration with 3D scene layering

## Scene Management

- [ ] Create SceneManager
  - [ ] Create `src/core/scene/SceneManager.ts`
  - [ ] Implement scene parsing from YAML (*.pix3scene files)
  - [ ] Create node hierarchy management
  - [ ] Validate `.pix3scene` files against JSON Schema during CI

- [ ] Implement node types
  - [ ] Create `src/core/scene/nodes/NodeBase.ts`
  - [ ] Create `src/core/scene/nodes/Node3D.ts`
  - [ ] Create `src/core/scene/nodes/Sprite2D.ts`
  - [ ] Create `src/core/scene/types.ts` for exports

## Plugin System

- [ ] Implement basic plugin architecture
  - [ ] Create `src/core/plugins/PluginManager.ts`
  - [ ] Define plugin interface and loading mechanism
  - [ ] Parse plugin `manifest.json` with declared capabilities and permission prompts

- [ ] Create pix3-basic-tools-plugin
  - [ ] Create `src/plugins/pix3-basic-tools-plugin/` directory
  - [ ] Implement tool for creating primitives (cube)
  - [ ] Create plugin components and commands

## History Management

- [ ] Implement Undo/Redo system
  - [ ] Create `src/core/history/HistoryManager.ts`
  - [ ] Integrate with Command pattern
  - [ ] Add keyboard shortcuts (Ctrl+Z, Ctrl+Y)

## Configuration and Assets

- [ ] Set up configuration files
  - [ ] Update `package.json` with scripts and dependencies
  - [ ] Configure `tsconfig.json` and `vite.config.ts`
  - [ ] Add ESLint/Prettier configuration

- [ ] Create basic assets
  - [ ] Add placeholder icons and fonts to `public/`
  - [ ] Create basic CSS styles in `src/styles/main.css`

## Testing and Validation

- [ ] Test basic functionality
  - [ ] Verify project builds successfully
  - [ ] Test File System API integration
  - [ ] Validate 3D scene rendering
  - [ ] Test basic scene loading
  - [ ] Measure viewport FPS to ensure ≥ 85 on baseline hardware

- [ ] Documentation
  - [ ] Create basic README.md with setup instructions
  - [ ] Document development workflow
  - [ ] Add inline code comments
  - [ ] Draft persona-specific onboarding checklists (TA, GE, PAP)

## Migration tasks

- [ ] Migrate existing raw `LitElement` components to use `ComponentBase` and `fw/di` where appropriate
  - [ ] Identify components that rely on light DOM or require injected services
  - [ ] Replace `extends LitElement` with `extends ComponentBase` and swap manual wiring for `@inject()` when possible
  - [ ] Run visual tests to ensure no regressions in styles or behavior

## Next Steps (Post-MVP)

- [ ] Implement advanced features (multi-tab interface, drag-and-drop, etc.)
- [ ] Add comprehensive error handling and telemetry reporting for commands
- [ ] Implement collaboration features
- [ ] Add unit and integration tests
- [ ] Performance optimization focused on frame budget and asset streaming
- [ ] User documentation and tutorials (персоны TA/GE/PAP)
<parameter name="filePath">/Users/igor.gritsenko/Projects/pix3/todo.md