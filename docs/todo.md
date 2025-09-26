# Pix3 Delivery Tracker

This tracker summarizes the execution status derived from `pix3-specification.md` (v1.5, 2025-09-26). Only specification work is complete; all engineering and product delivery tasks are pending.

## ✅ Completed

- [x] Publish technical specification v1.5 aligning teams on architecture, scope, and roadmap (2025-09-26)

## 🧭 Work Breakdown

### Milestone 0 — Foundation (Completed)
- [x] Bootstrap Vite + TypeScript + Lit workspace via `npm create vite@latest pix3 -- --template lit-ts`
- [x] Install baseline dependencies: Valtio, Three.js, PixiJS (optional), Golden Layout, reflect-metadata
- [x] Configure strict TypeScript (`experimentalDecorators`, `emitDecoratorMetadata`, path aliases)
- [x] Scaffold repo structure per spec (src/components, src/core, src/plugins, src/rendering, src/services, src/state, src/styles)
- [x] Implement `fw` helpers (`ComponentBase`, DI container, injectables) and export barrel in `docs/fw`
- [x] Establish CI pipeline (lint, type-check, test) and add ESLint + Prettier configuration
- [x] Author initial README with setup workflow and persona overview

### Milestone 1 — Scene Authoring (Not started)
- [x] Implement Valtio-based `AppState` and expose proxy via `src/state/index.ts`
- [x] Define command contracts (`src/core/commands/command.ts`) and telemetry hooks
- [x] Build `HistoryManager`, `OperationService`, and supporting operation abstractions (bulk, undo payloads)
- [x] Implement FileSystemAPIService for project folder access, YAML loading, and error handling
- [x] Integrate Golden Layout shell with Scene Tree, Viewport, Inspector, Asset Browser panels and persona presets
	- Bootstrapped `LayoutManagerService` with persona-aware presets and registered panel components (`scene-tree`, `viewport`, `inspector`, `asset-browser`).
	- Added `pix3-editor` shell with persona picker, loading overlay, and Golden Layout host wired through DI.
- [ ] Create foundational UI components extending `ComponentBase` with DI usage and keyboard-accessible chrome
- [ ] Stand up rendering pipeline: Three.js viewport + orthographic overlay stub, camera controls, lighting primitives
- [ ] Build `SceneManager`, node classes (`NodeBase`, `Node3D`, `Sprite2D`), and YAML schema validation pipeline

### Milestone 2 — Playable Export (Not started)
- [ ] Deliver playable-ad export preset producing HTML bundle with required analytics hooks
- [ ] Implement undo/redo polishing, including keyboard shortcuts and bounded stacks
- [ ] Create `pix3-basic-tools-plugin` with primitive creation command and tool UI wired through DI
- [ ] Add autosave, telemetry emission, and layout/session persistence (30s cadence)

### Milestone 3 — Collaboration Preview (Post-MVP, Not started)
- [ ] Implement collaboration services (shared sessions, commenting, live cursors)
- [ ] Harden plugin sandboxing and permission prompts for collaborative scenarios

## 📦 Backlog & Quality Initiatives
- [ ] Migration: convert any pre-existing raw LitElement components to `ComponentBase` + `@inject`
- [ ] Accessibility: ensure WCAG 2.1 AA compliance, high-contrast theme, keyboard navigation tests
- [ ] Performance: verify ≥85 FPS on baseline hardware, cold start <6s, command latency <80ms
- [ ] Internationalization: wire i18n keys with EN/RU bundles and localized YAML support (`locale` blocks)
- [ ] Testing: add Vitest suites for command history, renderer facades, FileSystem API mocks, scene parsing
- [ ] Documentation: draft persona-specific onboarding checklists (TA, GE, PAP) and plugin SDK guidance
<parameter name="filePath">/Users/igor.gritsenko/Projects/pix3/todo.md