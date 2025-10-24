# Pix3 Architecture Diagram

This document contains a high-level architecture diagram for Pix3 and notes about viewing and exporting diagrams in VS Code. It reflects the current operations-first model where the OperationService is the single entry point for mutations and history.

## Mermaid diagram

Below is a Mermaid system diagram that represents the architecture described in `pix3-specification.md` (v1.8, operations-first).

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
    H["OperationService (invoke, undo, redo)"]
    I["HistoryManager"]
    J["SceneManager"]
    K["PluginManager"]
    L["Plugin State Management"]
    Q["Commands (thin wrappers)"]
    S["Message Bus"]
  end

  subgraph Services
    M["FileSystemAPIService"]
    N["Telemetry / Analytics Stub"]
  end

  subgraph Rendering
    O["Three.js Pipeline (Perspective + Ortho Pass)"]
    R["ViewportRenderService"]
  end

  A ---|renders| D
  D ---|uses unified pipeline| O
  D ---|observes resize| R
  R ---|triggers resize| O

  C -->|reads| G
  E -->|reads| G
  Q -->|invokes operations| H
  Q -->|emits events| S
  H -->|mutates via operations| G
  I -->|tracks| H
  J -->|loads/parses| G
  K -->|registers commands| H
  L -->|manages plugin state| G

  G -->|persists layout| M
  H -->|emits| N
  J -->|loads scenes| M

  %% UI can also call operations directly for tool flows
  A -.direct ops for tools.- H

  S -->|notifies| A

  O -->|reads scene nodes| J
```

## Roles

Pix3 is designed for a range of users with different priorities and workflows. The architecture supports flexible UI layouts, plugin APIs, and export options to meet these needs.