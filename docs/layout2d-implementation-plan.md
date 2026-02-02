# Layout2D Node Implementation Plan

## Overview

This document describes the implementation of a special `Layout2D` node that represents the 2D game viewport, separating it from the editor's WebGL viewport. This allows for consistent anchor-based layout calculations and enables testing different screen sizes from the inspector.

## Current System Analysis

The current 2D layout system anchors root `Group2D` nodes directly to the editor's WebGL viewport:

- `ViewportRenderService.resize()` calls `SceneManager.resizeRoot()` with viewport dimensions
- Root `Group2D` nodes use `isViewportContainer` property to identify viewport-aligned containers
- `Group2D.updateLayout(width, height)` receives parent dimensions and recursively updates children
- Visuals update with green color (0x4ecf4e) for viewport containers

## Proposed Architecture

### Layout2D Node

A special root node representing the game viewport:

- Contains all 2D nodes as children
- Has configurable width/height properties (simulating different screen sizes)
- Includes preset dropdown for common resolutions
- Triggers layout recalculation for all `Group2D` children when size changes
- Visual representation in editor (dashed border indicating game viewport boundaries)

## Implementation Tasks

### 1. Create Layout2D Node Class

**File**: `packages/pix3-runtime/src/nodes/2D/Layout2D.ts`

**Key Features**:

- Extend `Node2D` (not `Group2D` to avoid layout recursion issues)
- Properties:
  - `width`: number - Game viewport width in pixels (default: 1920)
  - `height`: number - Game viewport height in pixels (default: 1080)
  - `resolutionPreset`: ResolutionPreset enum - Quick preset selection
  - `showViewportOutline`: boolean - Toggle visual border
- Methods:
  - `updateLayout(width?, height?)`: Update dimensions and trigger child recalculation
  - `recalculateChildLayouts()`: Recursively call `updateLayout()` on all `Group2D` children
  - `getPropertySchema()`: Expose properties to inspector with preset dropdown

**Resolution Presets**:

```typescript
enum ResolutionPreset {
  Custom = 'custom',
  FullHD = '1920x1080',
  HD = '1280x720',
  MobilePortrait = '1080x1920',
  MobileLandscape = '1920x1080',
  Tablet = '1024x768',
}
```

### 2. Update SceneLoader

**File**: `packages/pix3-runtime/src/core/SceneLoader.ts`

**Changes**:

- Add `'Layout2D'` case in `createNodeFromDefinition()`
- Parse Layout2D-specific properties (width, height, resolutionPreset, showViewportOutline)
- Load from scene file YAML structure

### 3. Update SceneManager

**File**: `packages/pix3-runtime/src/core/SceneManager.ts`

**Changes**:

- Modify `resizeRoot()` to:
  - Find Layout2D root node (or auto-create if missing)
  - Only update Layout2D size (not individual Group2D roots)
  - Call `layout2d.recalculateChildLayouts()` to propagate changes
- Add `ensureLayout2D()` method to auto-create Layout2D if scene doesn't have one
- **Remove** isViewportContainer compatibility (user chose forced migration)

### 4. Create Layout2D Visual Renderer

**File**: `src/services/ViewportRenderService.ts`

**Changes**:

- Add `layout2dVisuals: Map<string, THREE.Object3D>` map
- Add `createLayout2DVisual()` method:
  - Render dashed border for viewport boundaries
  - Show resolution text in corner
  - Use distinctive color (e.g., purple 0x9b59b6) to differentiate from Group2D
- Update `syncAll2DVisuals()` to handle Layout2D visuals
- Modify `resize()` to only update Layout2D, not root Group2D nodes directly

**Visual Design**:

```
┌─────────────────────────────┐
│  Layout2D: 1920x1080     │  ← Resolution label in corner
│ ┌───────────────────────┐  │
│ │  Group2D children     │  │  ← Child content
│ │  (anchored here)     │  │
│ └───────────────────────┘  │
└─────────────────────────────┘  ← Dashed border (showViewportOutline=true)
```

### 5. Update ViewportRenderService for Layout Recalculation

**File**: `src/services/ViewportRenderService.ts`

**Changes**:

- In `resize()` method: Call `sceneManager.resizeRoot()` which now targets Layout2D
- When Layout2D size changes (via inspector), call `layout2d.recalculateChildLayouts()`
- Remove `isViewportContainer` color differentiation from Group2D visual sync
- Keep Group2D visual blue (0x96cbf6) uniformly

### 6. Create Command/Operation for Layout2D

**Files**:

- `src/features/scene/CreateLayout2DCommand.ts`
- `src/features/scene/CreateLayout2DOperation.ts`
- `src/features/scene/UpdateLayout2DSizeCommand.ts`
- `src/features/scene/UpdateLayout2DSizeOperation.ts`

**Functionality**:

- CreateLayout2D: Auto-create when scene loads (single instance per scene)
- UpdateLayout2DSize: Handle preset dropdown and manual width/height changes

### 7. Register Layout2D in NodeRegistry

**File**: `src/services/NodeRegistry.ts`

**Changes**:

- Add Layout2D registration (order: 0, before Group2D)
- Set category to '2D'
- Icon: 'viewport' or 'layout'
- Mark as special/root node type (probably don't show in create menu since it's auto-created)

### 8. Update Inspector for Layout2D Properties

**File**: `src/ui/object-inspector/inspector-panel.ts`

**Changes**:

- Layout2D property schema already provides UI via existing system
- Ensure preset dropdown renders properly in inspector
- Add visual feedback when preset changes (update width/height)

### 9. Remove Legacy isViewportContainer Logic

**Files** to update:

- `packages/pix3-runtime/src/nodes/2D/Group2D.ts` - Remove `isViewportContainer` getter
- `src/services/ViewportRenderService.ts` - Remove isViewportContainer checks and green color
- `src/services/TransformTool2d.ts` - Update any viewport container references

### 10. Update Startup Scene Template

**File**: `src/templates/startup-scene.pix3scene`

**Changes**:

- Replace root Group2D "ui-layer" with Layout2D node
- Structure:

```yaml
root:
  - id: environment-root
    type: Node3D
    ...
  - id: layout2d-root
    type: Layout2D
    name: 2D Layout
    properties:
      width: 1920
      height: 1080
      resolutionPreset: FullHD
      showViewportOutline: true
    children:
      - id: logo-sprite
        type: Sprite2D
        ...
```

### 11. Update SceneGraph and Scene Hierarchy State

**File**: `packages/pix3-runtime/src/core/SceneGraph.ts`

**Changes**:

- Ensure Layout2D can be a root node
- Add `layout2dRoot?: Layout2D` property for quick access

### 12. Scene Migration (One-time)

**Operation**: Create migration command for existing scenes

**Logic**:

- Detect scenes with root Group2D using viewport container anchors
- Wrap them in new Layout2D node
- Convert isViewportContainer nodes to regular Group2D children
- Preserve existing anchors/offsets (now relative to Layout2D instead of viewport)

## File Structure Summary

```
packages/pix3-runtime/src/nodes/2D/
  Layout2D.ts           [NEW]

src/features/scene/
  CreateLayout2DCommand.ts          [NEW]
  CreateLayout2DOperation.ts        [NEW]
  UpdateLayout2DSizeCommand.ts      [NEW]
  UpdateLayout2DSizeOperation.ts    [NEW]

src/services/
  NodeRegistry.ts      [MODIFY] - Register Layout2D
  ViewportRenderService.ts  [MODIFY] - Layout2D visuals, remove isViewportContainer

packages/pix3-runtime/src/core/
  SceneManager.ts     [MODIFY] - Update resizeRoot logic for Layout2D
  SceneLoader.ts     [MODIFY] - Load Layout2D from YAML

src/templates/
  startup-scene.pix3scene     [MODIFY] - Use Layout2D instead of root Group2D

packages/pix3-runtime/src/nodes/2D/
  Group2D.ts          [MODIFY] - Remove isViewportContainer property
```

## Implementation Order

1. **Create Layout2D node class** (core data structure)
2. **Update SceneLoader** (YAML parsing support)
3. **Update SceneManager** (layout recalculation logic)
4. **Create commands/operations** (mutation support)
5. **Update ViewportRenderService** (visual rendering + resize logic)
6. **Register in NodeRegistry** (create menu integration)
7. **Update startup scene template** (default scene)
8. **Remove isViewportContainer legacy** (cleanup)
9. **Test**:
   - Create scene with Layout2D
   - Change resolution presets
   - Add Group2D children with different anchor configurations
   - Verify anchors recalculate correctly when Layout2D size changes
   - Test visual rendering (border, resolution label)

## Key Technical Details

### Layout Recalculation Flow

```
User changes Layout2D size/preset
  ↓
UpdateLayout2DSizeOperation.execute()
  ↓
layout2d.width/height updated
  ↓
layout2d.updateLayout() called
  ↓
layout2d.recalculateChildLayouts()
  ↓
For each Group2D child:
  child.updateLayout(layout2d.width, layout2d.height)
  ↓
Recursive: child.updateLayout() calls child's children
```

### Coordinate System

- Layout2D positioned at (0, 0) with no rotation/scale (immutable root)
- All child Group2D/Sprite2D positions relative to Layout2D center
- Anchors (0-1) normalized across Layout2D dimensions
- Offsets in pixels from anchor points

### Visual Differentiation

- Layout2D: Purple dashed border with resolution label
- Group2D: Blue solid outline
- Sprite2D: No outline (texture rendered)

### Scene File Format

```yaml
root:
  - id: layout2d-root
    type: Layout2D
    name: 2D Layout
    properties:
      width: 1920
      height: 1080
      resolutionPreset: FullHD
      showViewportOutline: true
    children:
      - id: ui-group
        type: Group2D
        name: UI Group
        properties:
          width: 200
          height: 100
          layout:
            anchorMin: [0, 1]
            anchorMax: [0, 1]
            offsetMin: [20, -20]
            offsetMax: [220, -120]
        children: []
```

## User Decisions

Based on initial consultation:

1. **Auto-creation**: Layout2D will be automatically added as root 2D node when loading scenes (for backward compatibility)
2. **Viewport Presets**: Layout2D will include preset dropdown for common mobile/desktop resolutions
3. **Backward Compatibility**: System will not support existing root Group2D nodes as viewport containers - forced migration required

## Benefits

This plan provides a clean separation between editor viewport and game viewport, enabling:

- Accurate game layout testing independent of editor window size
- Quick switching between different screen resolutions
- More consistent anchor recalculations
- Better understanding of actual game viewport boundaries
- Easier game UI development for multiple screen sizes
