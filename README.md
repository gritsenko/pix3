# Pix3 Editor

Pix3 is a browser-based editor for building rich HTML5 scenes that combine 2D and 3D layers.

## Architecture Overview

Pix3 employs an **operations-first architecture** where all state mutations are handled by `OperationService`. Actions are initiated via `CommandDispatcher`, which wraps operations. Core functionalities are provided by **injectable services** (`@injectable()`, `@inject()`). UI and metadata are managed by **Valtio reactive proxies** (`appState`), while **scene nodes are non-reactive** and owned by `SceneManager` in `SceneGraph` objects. The rendering is handled by a single **Three.js pipeline**. UI components extend `ComponentBase`, defaulting to **light DOM**. A **Property Schema System** dynamically renders UI in the Inspector based on node schemas.

See full specification in [docs/pix3-specification.md](docs/pix3-specification.md).
Additional agent guidelines: [AGENTS.md](AGENTS.md).

## Development Quick Start

### Prerequisites

- Node.js 18+
- npm (or yarn)
- Chromium-based browser

### Setup

```bash
git clone <repository-url>
cd pix3
npm install
```

### Run Dev Server

```bash
npm run dev
```

Open the app at `http://localhost:5173`.

### Debugging (Chrome + MCP)

1. Launch Chrome with remote debugging. The `.vscode/launch.json` config uses these flags.
2. Start the MCP server from the workspace root:
   ```bash
   npx chrome-devtools-mcp@0.12.1 --autoConnect --browserUrl=http://127.0.0.1:9222
   ```

## Scripts

- `npm run dev` - Start Vite dev server with hot reload
- `npm run build` - Build production bundle
- `npm run test` - Run Vitest unit tests
- `npm run lint` - Check code style and errors
- `npm run format` - Format code with Prettier
- `npm run type-check` - Validate TypeScript types

## Styling & Theme Variables

Use CSS custom properties for accent colors, defined in `src/index.css`:
- `--pix3-accent-color: #ffcf33` (for hex values)
- `--pix3-accent-rgb: 255, 207, 51` (for `rgba()` functions with opacity)

Example: `background: rgba(var(--pix3-accent-rgb), 0.8);`

## Testing & Quality

- **Unit Tests**: Vitest
- **Linting**: ESLint with TypeScript and Lit-specific rules
- **Formatting**: Prettier
- **Type Safety**: Strict TypeScript
- **Accessibility**: WCAG 2.1 AA compliance target

## Standalone Build Plan (Template-Driven)

This plan is for adding a **Project -> Build Standalone** command that prepares an opened Pix3 project so the user can run `npm run build` in terminal and get a runnable `dist/`.

### Goal

- Keep editor-side changes minimal
- Store all generated scaffolding in `src/templates/standalone/`
- Copy runtime sources from `packages/pix3-runtime/` during generation
- On build command, materialize/actualize templates into the project folder
- Avoid changing operations/state architecture

### High-Level Design

1. Add template files under `src/templates/standalone/` as the single source of truth.
2. Add one new command: `project.build-standalone` in the `project` menu.
3. Command calls a new service that:
   - validates project context
   - gathers project data (scene list, active scene, asset/script paths)
   - writes generated files from templates into the opened project
   - updates `package.json` scripts safely
4. Generated standalone app builds with Vite to `dist/`.

### Minimal Editor Changes

- Add command file:
  - `src/features/project/BuildStandaloneCommand.ts`
- Add service file:
  - `src/services/StandaloneBuildService.ts`
- Register command in:
  - `src/ui/pix3-editor-shell.ts`
- Export service in:
  - `src/services/index.ts`

No changes required to OperationService architecture. This is a tooling command (non-scene mutation).

### Template Files To Add

Create `src/templates/standalone/` with:

- `index.html.tpl`
- `vite.config.ts.tpl`
- `tsconfig.json.tpl` (optional but recommended for isolated builds)
- `package.partial.json.tpl` (scripts/deps fragment or merge map)
- `src/main.ts.tpl`
- `src/index.ts`
- `src/register-project-scripts.ts.tpl`

Runtime files are copied from `packages/pix3-runtime/` (not templated in `src/templates/standalone/`).

Use placeholders:

- `{{PROJECT_NAME}}`
- `{{ACTIVE_SCENE_PATH}}`
- `{{SCENE_PATHS_JSON}}`
- `{{SCRIPT_IMPORTS}}`
- `{{SCRIPT_REGISTRATION}}`

### Project Output Layout

On command execution, generate under opened project root:

- `standalone/index.html`
- `standalone/vite.config.ts`
- `standalone/tsconfig.json` (if used)
- `standalone/src/main.ts`
- `standalone/pix3-runtime/src/index.ts`
- `standalone/src/register-project-scripts.ts`
- `standalone/asset-manifest.json`
- `standalone/src/generated/scene-manifest.ts`
- `standalone/runtime/**` (copied from `packages/pix3-runtime/`)

### Command Contract

`BuildStandaloneCommand` metadata:

- `id`: `project.build-standalone`
- `title`: `Build Standalone`
- `menuPath`: `project`
- `addToMenu`: `true`
- `keywords`: `['build', 'standalone', 'export', 'dist']`

Preconditions:

- project status is `ready`
- at least one scene exists in `appState.scenes.descriptors`

Execute:

- call `StandaloneBuildService.buildFromTemplates()`
- return `didMutate: false` (tooling/scaffold action)

### StandaloneBuildService Responsibilities

1. Collect context
   - project name from `appState.project.projectName`
   - active scene from `appState.scenes.activeSceneId`
   - all scene descriptor paths
2. Scan project files
   - include `scripts/*.ts` and `src/scripts/*.ts`
   - include `.pix3scene` files and `res://` dependencies if manifesting
3. Render templates
   - replace placeholders
   - produce deterministic outputs
4. Write files
   - create directories first
   - overwrite only generated files
5. Merge `package.json`
   - add scripts:
     - `build` -> `vite build --config standalone/vite.config.ts` (if missing)
     - `build:pix3` fallback if `build` already owned by user
   - add required deps/devDeps if absent
6. Show completion dialog
   - include what was generated and next commands to run

### Runtime + Script Compatibility

Current user scripts import from `@pix3/runtime`. Keep this unchanged by aliasing it to `standalone/pix3-runtime/src/index.ts` in standalone `vite.config.ts`.

Expected standalone aliasing:

- `@pix3/runtime` -> generated runtime location (if copied into standalone)

`register-project-scripts.ts` should import discovered user script files and register them in `ScriptRegistry` as `user:<ClassName>`.

### Build Pipeline in Generated Standalone

Generated `standalone/src/main.ts` should:

1. Instantiate runtime services (`ResourceManager`, `AssetLoader`, `SceneLoader`, `SceneSaver`, `SceneManager`, `ScriptRegistry`)
2. Register built-in scripts
3. Register project scripts from generated registrar
4. Load target scene (`{{ACTIVE_SCENE_PATH}}` fallback to first in manifest)
5. Start `SceneRunner` with `RuntimeRenderer`
6. Mount to `#app`

### Idempotency Rules

- Re-running build command should update generated files in place.
- Non-generated user files must not be modified.
- For collisions on key files (`package.json` scripts), apply merge strategy, never destructive replace.

### Suggested Test Coverage

Add specs for:

- `BuildStandaloneCommand` preconditions and execute dispatch
- `StandaloneBuildService` template rendering
- `StandaloneBuildService` package.json merge behavior
- placeholder replacement for active scene/script imports
- idempotent second run snapshot

### Manual Validation Checklist

1. Open project in editor.
2. Run `Project -> Build Standalone`.
3. Verify generated `standalone/` files exist.
4. In project terminal run:
   - `npm install`
   - `npm run build` (or `npm run build:pix3` if merged that way)
5. Verify `dist/` created and scene runs correctly when served.

### Implementation Order (for another agent)

Progress status:

- [x] Add templates in `src/templates/standalone/`
- [x] Implement `StandaloneBuildService`
- [x] Implement `BuildStandaloneCommand`
- [x] Register command in `pix3-editor-shell.ts`
- [x] Add/adjust tests
- [x] Run `npm run lint`, `npm run test`, `npm run build`
- [x] Add progress modal and logging with build statistics

## License

[Add your license information here]

---

**Built with ❤️ for creators who blend pixels and polygons**
