# Copilot Instructions

These guardrails help generate consistent code and documentation for the Pix3 editor. Treat them as authoritative unless the specification (`docs/pix3-specification.md`) or maintainers request an exception.

## Project Overview

- Pix3 is a browser-based editor for building HTML5 scenes that blend 2D and 3D layers.
- Target stack: **TypeScript**, **Vite**, **Lit** + repo-specific `fw` utilities, **Valtio** for state, **Three.js** for rendering (PixiJS optional overlay), **Golden Layout** for panels.
- Source of truth for requirements, architecture, and roadmap: `docs/pix3-specification.md` (version 1.5, 2025-09-26).

## Coding Conventions

- Default to TypeScript `strict` mode with decorators enabled (`experimentalDecorators`, `emitDecoratorMetadata`).
- UI components must extend `ComponentBase` from `docs/fw` instead of raw `LitElement` unless explicitly noted. Use the provided helpers (`customElement`, `property`, `css`, etc.).
- Resolve services via the `@inject()` decorator from `fw/di`. Register services with `@injectable()` and expose a `dispose()` method when they hold resources.
- Keep DOM mode decisions centralized: `ComponentBase` uses light DOM by default; opt into shadow DOM through `static useShadowDom = true` when necessary.
- Use `valtio` proxies for global state. Treat the proxy as the single source of truth and mutate it only inside commands/operations.
- Follow the command lifecycle contract: `preconditions()` → `execute()` → `postCommit()` returning undo payloads. Commands are the **only** code allowed to modify state.
- Emit telemetry/analytics events whenever commands execute or operations are invoked.

## Architecture Expectations

- Respect the unidirectional data flow described in the specification: state → commands → managers → UI.
- History management lives in `HistoryManager` with bounded stacks (default 100). New operations clear redo history.
- Use the message bus for async notifications between commands, UI, and plugins. Prefer typed event payloads.
- Scene data comes from YAML `.pix3scene` files. Enforce unique node IDs, `res://` asset paths, and per-file versioning. Plan for migrations in `SceneManager`.
- Rendering abstractions should conform to `IRenderLayer`-style interfaces so alternative engines (PixiJS overlay) can slot in.
- Keep plugin contracts sandboxed: load via manifest, validate capabilities, and namespace registrations.

## File & Module Layout

Follow the structure documented in the specification:

```
src/
  components/
  core/
    commands/
    operations/
    history/
    layout/
    plugins/
    scene/
  plugins/
    pix3-basic-tools-plugin/
  rendering/
  services/
  state/
  styles/
```

Create barrel files (`index.ts`) when the spec mentions them. Co-locate tests with source files using `.spec.ts` or `.test.ts` suffixes.

## Testing & Quality Gates

- Add Vitest unit tests for new logic (commands, operations, managers, services). Include edge cases such as empty scenes, duplicate IDs, and undo-stack overflow.
- Validate YAML schemas using AJV (or equivalent) for `.pix3scene` files.
- Ensure accessibility (WCAG 2.1 AA) for UI updates: keyboard navigation, aria attributes, high-contrast themes.
- Watch performance budgets: ≥85 FPS viewport on baseline hardware, cold start <6s, command-to-UI latency <80ms.
- Provide optional CLI instructions in documentation but run smoke tests yourself when feasible.

## Documentation Guidelines

- Update `docs/pix3-specification.md` only when scope changes are approved; maintain a changelog entry.
- Keep `docs/todo.md` synchronized with specification milestones (Milestones 0–3, backlog initiatives).
- Include persona-aligned notes (Technical Artist, Gameplay Engineer, Playable Ad Producer) when adding onboarding steps or workflows.

## Out of Scope / Cautions

- Do not target non-Chromium browsers for MVP; show compatibility messaging instead.
- Avoid persisting user project data outside the File System Access API. Plugins must request explicit permissions before accessing services.
- Treat collaboration features as post-MVP (Milestone 3) unless a task explicitly escalates them.

Always cross-check deliverables with the specification before marking work complete.
