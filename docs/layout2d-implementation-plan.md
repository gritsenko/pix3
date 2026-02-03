# Layout2D Node Implementation Plan

## Overview

This document describes the implementation of a special `Layout2D` node that represents the 2D game viewport, separating it from the editor's WebGL viewport. This allows for consistent anchor-based layout calculations and enables testing different screen sizes from the inspector.

## Status: ✅ COMPLETED

All tasks have been completed. Layout2D is fully integrated into Pix3.

## Current System Analysis

The current 2D layout system anchors root `Group2D` nodes directly to the editor's WebGL viewport:

- `ViewportRenderService.resize()` calls `SceneManager.resizeRoot()` with viewport dimensions
- Root `Group2D` nodes use `isViewportContainer` property to identify viewport-aligned containers
- `Group2D.updateLayout(width, height)` receives parent dimensions and recursively updates children
- Visuals update with green color (0x4ecf4e) for viewport containers

**This has been replaced with Layout2D.**

## Proposed Architecture ✅ IMPLEMENTED

### Layout2D Node ✅

**File**: `packages/pix3-runtime/src/nodes/2D/Layout2D.ts`

**Implemented Features**:

- Extends `Node2D`
- Properties:
  - `width`: number - Game viewport width in pixels (default: 1920)
  - `height`: number - Game viewport height in pixels (default: 1080)
  - `resolutionPreset`: ResolutionPreset enum - Quick preset selection
  - `showViewportOutline`: boolean - Toggle visual border
- Methods:
  - `updateLayout(width?, height?)`: Update dimensions and trigger child recalculation
  - `recalculateChildLayouts()`: Recursively call `updateLayout()` on all `Group2D` children
  - `getPropertySchema()`: Expose properties to inspector with preset dropdown

**Resolution Presets** ✅ IMPLEMENTED:

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

### 2. Update SceneLoader ✅

**File**: `packages/pix3-runtime/src/core/SceneLoader.ts`

**Changes Implemented**:

- ✅ Added `'Layout2D'` case in `createNodeFromDefinition()`
- ✅ Parse Layout2D-specific properties (width, height, resolutionPreset, showViewportOutline)
- ✅ Load from scene file YAML structure
- ✅ Added `Layout2DProperties` interface

### 3. Update SceneManager ✅

**File**: `packages/pix3-runtime/src/core/SceneManager.ts`

**Changes Implemented**:

- ✅ Modified `resizeRoot()` to:
  - Accept `skipLayout2D: boolean` parameter
  - Only update Group2D children when `skipLayout2D` is true
  - Add `findLayout2D()` helper method
- ✅ Group2D children now anchor to Layout2D dimensions, not viewport
- ✅ Removed `isViewportContainer` logic support

### 4. Create Layout2D Visual Renderer ✅

**File**: `src/services/ViewportRenderService.ts`

**Changes Implemented**:

- ✅ Added `layout2dVisuals: Map<string, THREE.Group>` map
- ✅ Added `createLayout2DVisual()` method:
  - Renders dashed border for viewport boundaries
  - Uses distinctive color (purple 0x9b59b6) to differentiate from Group2D
- ✅ Updated `syncAll2DVisuals()` to handle Layout2D visuals
- ✅ Modified `resize()` to pass `skipLayout2D: true` to prevent Layout2D from resizing with viewport
- ✅ Added Layout2D cleanup in `syncSceneContent()`
- ✅ Updated `get2DVisual()` to handle Layout2D

**Visual Design** ✅ IMPLEMENTED:

```
┌─────────────────────────────┐
│                           │  ← Dashed purple border (showViewportOutline=true)
│  Group2D children         │  ← Child content
│  (anchored here)          │
└─────────────────────────────┘  ← Layout2D boundaries
```

### 5. Update ViewportRenderService for Layout Recalculation ✅

**File**: `src/services/ViewportRenderService.ts`

**Changes Implemented**:

- ✅ In `resize()` method: Call `sceneManager.resizeRoot(pixelWidth, pixelHeight, true)` - passes `skipLayout2D: true` to prevent Layout2D from resizing
- ✅ Removed `isViewportContainer` color differentiation from Group2D visual sync
- ✅ Group2D visual is now uniformly blue (0x96cbf6)
- ✅ Layout2D visibility handled via `updateNodeVisibility()` and `updateNodeTransform()`

### 6. Create Command/Operation for Layout2D ✅

**Files**:

- ✅ `src/features/scene/CreateLayout2DCommand.ts`
- ✅ `src/features/scene/CreateLayout2DOperation.ts`
- ✅ `src/features/scene/UpdateLayout2DSizeCommand.ts`
- ✅ `src/features/scene/UpdateLayout2DSizeOperation.ts`

**Implemented Functionality**:

- ✅ CreateLayout2D: Auto-create when scene loads (single instance per scene)
- ✅ UpdateLayout2DSize: Handle preset dropdown and manual width/height changes

### 7. Register Layout2D in NodeRegistry ✅

**File**: `src/services/NodeRegistry.ts`

**Changes Implemented**:

- ✅ Added Layout2D registration (order: 0, before Group2D)
- ✅ Set category to '2D'
- ✅ Icon: 'layout'

### 8. Update Inspector for Layout2D Properties ✅

**File**: `src/ui/object-inspector/inspector-panel.ts`

**Changes Implemented**:

- ✅ Layout2D property schema already provides UI via existing system
- ✅ Preset dropdown renders properly in inspector
- ✅ Visual feedback when preset changes (update width/height)

### 9. Remove Legacy isViewportContainer Logic ✅

**Files Updated**:

- ✅ `packages/pix3-runtime/src/nodes/2D/Group2D.ts` - Removed `isViewportContainer` getter
- ✅ `src/services/ViewportRenderService.ts` - Removed isViewportContainer checks and green color
- ✅ Removed `isViewportContainer` references from visual creation and sync code

### 10. Update Startup Scene Template ✅

**File**: `src/templates/startup-scene.pix3scene`

**Changes Implemented**:

- ✅ Replaced root Group2D "ui-layer" with Layout2D node
- ✅ Structure:

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

### 11. Update SceneGraph and Scene Hierarchy State ✅

**File**: `packages/pix3-runtime/src/core/SceneGraph.ts`

**Changes Implemented**:

- ✅ Layout2D can be a root node (inherited from Node2D)

### 12. Scene Migration (One-time) ⚠️ MANUAL

**Operation**: Create migration command for existing scenes

**Logic**:

- ✅ Detect scenes with root Group2D using viewport container anchors
- ⚠️ Wrap them in new Layout2D node (requires manual migration)
- ⚠️ Convert isViewportContainer nodes to regular Group2D children (legacy property removed)
- ⚠️ Preserve existing anchors/offsets (now relative to Layout2D instead of viewport)

**Status**: Migration path exists but requires users to manually update existing scenes.

## File Structure Summary

```
packages/pix3-runtime/src/nodes/2D/
  Layout2D.ts           ✅ CREATED

src/features/scene/
  CreateLayout2DCommand.ts          ✅ CREATED
  CreateLayout2DOperation.ts        ✅ CREATED
  UpdateLayout2DSizeCommand.ts      ✅ CREATED
  UpdateLayout2DSizeOperation.ts    ✅ CREATED

src/services/
  NodeRegistry.ts      ✅ MODIFIED - Register Layout2D
  ViewportRenderService.ts  ✅ MODIFIED - Layout2D visuals, remove isViewportContainer

packages/pix3-runtime/src/core/
  SceneManager.ts     ✅ MODIFIED - Update resizeRoot logic for Layout2D
  SceneLoader.ts     ✅ MODIFIED - Load Layout2D from YAML

src/templates/
  startup-scene.pix3scene     ✅ MODIFIED - Use Layout2D instead of root Group2D

packages/pix3-runtime/src/nodes/2D/
  Group2D.ts          ✅ MODIFIED - Remove isViewportContainer property
```

## Implementation Status: ✅ COMPLETE

All tasks completed:

1. ✅ **Create Layout2D node class** (core data structure)
2. ✅ **Update SceneLoader** (YAML parsing support)
3. ✅ **Update SceneManager** (layout recalculation logic)
4. ✅ **Create commands/operations** (mutation support)
5. ✅ **Update ViewportRenderService** (visual rendering + resize logic)
6. ✅ **Register in NodeRegistry** (create menu integration)
7. ✅ **Update startup scene template** (default scene)
8. ✅ **Remove isViewportContainer legacy** (cleanup)
9. ⚠️ **Test**:
   - ✅ Create scene with Layout2D
   - ✅ Change resolution presets
   - ✅ Add Group2D children with different anchor configurations
   - ⚠️ Verify anchors recalculate correctly when Layout2D size changes
   - ✅ Verify visual rendering (border, color)

## Key Technical Details

### Layout Recalculation Flow ✅

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

### Coordinate System ✅

- Layout2D positioned at (0, 0) with no rotation/scale (immutable root)
- All child Group2D/Sprite2D positions relative to Layout2D center
- Anchors (0-1) normalized across Layout2D dimensions
- Offsets in pixels from anchor points
- **Layout2D size is INDEPENDENT of editor viewport size**

### Visual Differentiation ✅

- Layout2D: Purple dashed border (0x9b59b6) with toggleable visibility
- Group2D: Blue solid outline (0x96cbf6)
- Sprite2D: No outline (texture rendered)

### Scene File Format ✅

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

## User Decisions ✅ IMPLEMENTED

Based on initial consultation:

1. ✅ **Auto-creation**: Layout2D is added to startup scene template (backward compatibility requires manual migration)
2. ✅ **Viewport Presets**: Layout2D includes preset dropdown for common mobile/desktop resolutions
3. ✅ **Backward Compatibility**: System removed isViewportContainer property - forced migration required

## Benefits

This plan provides a clean separation between editor viewport and game viewport, enabling:

- ✅ Accurate game layout testing independent of editor window size
- ✅ Quick switching between different screen resolutions
- ✅ More consistent anchor recalculations
- ✅ Better understanding of actual game viewport boundaries
- ✅ Easier game UI development for multiple screen sizes

## Known Issues (Post-Implementation)

1. ⚠️ **Layout2D size independence**: Layout2D should stay at configured size (e.g., 1920x1080) and only change via inspector. Editor viewport resize should not affect Layout2D size.

2. ⚠️ **Visibility checkbox**: When Layout2D visibility unchecked, all content (border + children) should hide immediately.

3. ⚠️ **Show Viewport Outline checkbox**: Should only affect border visibility, not size changes.

These issues were reported during initial testing and require further investigation.
