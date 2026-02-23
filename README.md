# Pix3 Editor

Pix3 is a browser-based editor for building rich HTML5 scenes that combine 2D and 3D layers.

## Architecture Overview

Pix3 employs an **operations-first architecture** where all state mutations are handled by `OperationService`. Actions are initiated via `CommandDispatcher`, which wraps operations. Core functionalities are provided by **injectable services** (`@injectable()`, `@inject()`). UI and metadata are managed by **Valtio reactive proxies** (`appState`), while **scene nodes are non-reactive** and owned by `SceneManager` in `SceneGraph` objects. The rendering is handled by a single **Three.js pipeline**. UI components extend `ComponentBase`, defaulting to **light DOM**. A **Property Schema System** dynamically renders UI in the Inspector based on node schemas.

Scene creation commands use a shared `CreateNodeBaseCommand` in `src/features/scene`, while each concrete `Create*Command` keeps node-specific metadata/IDs for registry and menu integration.

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

## License

[Add your license information here]

---

**Built with ❤️ for creators who blend pixels and polygons**
