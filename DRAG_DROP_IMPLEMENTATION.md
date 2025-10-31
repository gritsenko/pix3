# Scene Tree Drag-and-Drop Implementation

## Overview
This implementation adds drag-and-drop functionality to the Pix3 scene tree component, allowing users to:
- **Reparent nodes**: Drag a node to a different parent to reorganize the hierarchy
- **Reorder nodes**: Drag a node before, after, or inside other nodes to change their order
- **Visual feedback**: Drag-over states show where the node will be dropped

## Changes Made

### 1. **New Operation: ReparentNodeOperation** (`src/features/scene/ReparentNodeOperation.ts`)
- Handles all logic for moving nodes within the scene graph
- Validates operations (prevents moving to descendants, self-drops, etc.)
- Supports undo/redo with full state preservation
- Manages parent-child relationships and node ordering
- Updates the scene hierarchy in Valtio state to trigger reactive updates
- Uses proper Three.js API (`add()`, `removeFromParent()`) for parent-child management

**Key methods:**
- `perform()`: Executes the reparent operation
- `undoReparent()`: Reverts to the previous state
- `redoReparent()`: Re-applies the operation
- `isDescendantOf()`: Validates drop targets to prevent circular references

### 2. **New Command: ReparentNodeCommand** (`src/features/scene/ReparentNodeCommand.ts`)
- Thin command wrapper following the operations-first pattern
- Validates preconditions (active scene required)
- Executes the operation via OperationService
- Integrates with CommandDispatcher for lifecycle management

### 3. **Enhanced Styles** (`src/ui/scene-tree/scene-tree-node.ts.css`)
Added visual feedback classes:
- `.tree-node__content--dragging`: Faded appearance while dragging
- `.tree-node__content--drag-over-top`: Top border indicator for "before" drop
- `.tree-node__content--drag-over-inside`: Highlight for "as child" drop
- `.tree-node__content--drag-over-bottom`: Bottom border indicator for "after" drop

### 4. **Updated SceneTreeNodeComponent** (`src/ui/scene-tree/scene-tree-node.ts`)
Added drag-and-drop handlers:
- `onDragStart()`: Initiates drag with node ID in data transfer
- `onDragEnd()`: Clears drag state
- `onDragOver()`: Detects drop position (top/inside/bottom) based on cursor Y position
- `onDragLeave()`: Clears visual feedback when leaving element
- `onDrop()`: Captures drop event and dispatches custom event
- `performReparent()`: Emits `node-drop` event for parent handling

Properties added:
- `dragOverPosition`: Tracks current drop zone ('top', 'inside', 'bottom', null)
- `isDragging`: Shows visual feedback while dragging

### 5. **Updated SceneTreePanel** (`src/ui/scene-tree/scene-tree-panel.ts`)
Added event handler:
- `onNodeDrop()`: Processes drop events with:
  - Looks up target node in scene graph
  - Calculates new parent and index based on drop position
  - Creates ReparentNodeCommand with correct parameters
  - Executes via CommandDispatcher

## Features

### Drop Position Detection
The implementation uses the Y position of the cursor within the drop target:
- **Top third**: Drop "before" (same parent, earlier index)
- **Middle third**: Drop "inside" (as child of target)
- **Bottom third**: Drop "after" (same parent, later index)

### Visual Feedback
- Dragged nodes become semi-transparent
- Drop zones highlight with borders or background tints
- Color-coded feedback matches the Pix3 UI theme (blue accents)

### Validation
- Prevents moving a node to itself
- Prevents moving a node to its own descendants (circular reference prevention)
- Validates that target exists in scene graph
- Requires active scene for operation

### Undo/Redo Support
All reparent operations are fully reversible through the history system with:
- Before/after state snapshots
- Complete parent and sibling restoration

## Architecture Alignment

The implementation follows all Pix3 architectural patterns:
1. ✅ **Operations-first model**: ReparentNodeOperation encapsulates mutation logic
2. ✅ **Commands as wrappers**: ReparentNodeCommand delegates to operation via OperationService
3. ✅ **Valtio reactivity**: Hierarchy updates trigger automatic UI re-renders
4. ✅ **Service injection**: Uses CommandDispatcher and SceneManager
5. ✅ **No direct appState mutation**: All changes flow through operations
6. ✅ **ComponentBase usage**: SceneTreeNodeComponent and SceneTreePanel extend ComponentBase
7. ✅ **Light DOM default**: Components use light DOM for global style integration
8. ✅ **TypeScript strict mode**: All code is fully typed

## Testing Recommendations

1. **Basic drag-and-drop**:
   - Create multiple nodes
   - Drag nodes to change parent relationships
   - Verify hierarchy updates correctly

2. **Reordering**:
   - Drag node to position before/after siblings
   - Verify order changes within parent

3. **Deeply nested reparenting** (FIXED):
   - Drag a deeply nested node to a higher ancestor
   - Drag before/after the ancestor (not inside)
   - Verify node moves to be a sibling of the ancestor
   - Check both top and bottom drop zones work correctly

4. **Undo/Redo**:
   - Perform drag operations
   - Undo and verify restoration
   - Redo and verify re-application

5. **Validation**:
   - Try dragging node to itself (should fail silently)
   - Try dragging node to its own child (should fail silently)
   - Try dragging with no active scene (should fail)

6. **Visual feedback**:
   - Verify drag-over states show correct drop zone
   - Check visual styling on different node types
   - Verify contrast and accessibility

## Usage Example

```typescript
// Users simply drag nodes in the UI
// The following happens automatically:

// 1. onDragStart fires, storing node ID
// 2. onDragOver determines drop zone position
// 3. onDrop emits custom event with details
// 4. onNodeDrop creates and executes ReparentNodeCommand
// 5. ReparentNodeOperation updates scene graph
// 6. Scene hierarchy state updates (Valtio reactive)
// 7. UI re-renders with new structure
// 8. Operation is added to history (undo/redo enabled)
```

## Files Modified/Created

- ✅ `src/features/scene/ReparentNodeOperation.ts` (NEW)
- ✅ `src/features/scene/ReparentNodeCommand.ts` (NEW)
- ✅ `src/ui/scene-tree/scene-tree-node.ts.css` (MODIFIED - added drag styles)
- ✅ `src/ui/scene-tree/scene-tree-node.ts` (MODIFIED - added drag handlers)
- ✅ `src/ui/scene-tree/scene-tree-panel.ts` (MODIFIED - added drop handler)
