# Pix3 Architecture Diagram

This document contains a high-level architecture diagram for Pix3 and notes about viewing and exporting diagrams in VS Code.

## Mermaid diagram

Below is a Mermaid system diagram that represents the architecture described in `pix3-specification.md` (v1.5).

```mermaid
flowchart LR
  subgraph UI
    A["ComponentBase (fw)"] --> B["Panels (Golden Layout)"]
    B --> C["Scene Tree"]
    B --> D["Viewport Component"]
    B --> E["Inspector"]
    B --> F["Asset Browser"]
  end

  subgraph Core
    G["AppState (Valtio)"]
    H["Command / Operation Service"]
    I["HistoryManager"]
    J["SceneManager"]
    K["PluginManager"]
    L["Plugin State Management"]
  end

  subgraph Services
    M["FileSystemAPIService"]
    N["Telemetry / Analytics Stub"]
  end

  subgraph Rendering
    O["Three.js Viewport Layer"]
    P["Overlay Layer (Three / Pixi adapter)"]
  end

  A ---|renders| D
  D ---|uses| O
  D ---|overlays| P

  C -->|interacts| G
  E -->|inspects| G
  H -->|mutates via commands| G
  I -->|tracks| H
  J -->|loads/parses| G
  K -->|registers commands| H
  L -->|manages plugin state| G

  G -->|persists layout| M
  H -->|emits| N
  J -->|loads scenes| M

  O -->|reads scene nodes| J
  P -->|renders 2D nodes| J
```