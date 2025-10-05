# Undo/Redo Implementation Summary (Operations-first)

## Overview
Undo/redo in Pix3 is implemented via the **OperationService**. Operations are the single source of truth for mutations and provide their own undo/redo via `OperationCommit` closures. Commands are thin wrappers that delegate to OperationService.

## What Was Implemented

### 1. Operations (first-class)
Operations live under `src/core/features/*/operations`. Examples:
- Selection: `SelectObjectOperation`
- Properties: `UpdateObjectPropertyOperation`
- Scene: `LoadSceneOperation` (non-undoable)

### 2. Thin Commands
Commands live under `src/core/features/*/commands` and merely validate preconditions then call OperationService. Undo/redo commands call `operationService.undo()`/`redo()` directly.

### 3. Keyboard Shortcuts
Registered in `Pix3EditorShell` component:

### 4. UI Component Integration
UI components call `OperationService` with operations directly (no adapter). Example: Inspector invokes `UpdateObjectPropertyOperation`; Scene Tree invokes `SelectObjectOperation`; Editor Shell invokes `LoadSceneOperation` on startup.


### Operation Lifecycle
```
User Action → Operation Created → OperationService.invokeAndPush()
                                                     ↓
                                         perform() returns OperationCommit
                                                     ↓
                                     HistoryManager.push(commit)
```

### Undo Flow
```
User: Cmd+Z → operationService.undo() → HistoryManager.undo()
                                              ↓
                                  Call stored undo() function from OperationCommit
```

### Redo Flow  
```
User: Shift+Cmd+Z → operationService.redo() → HistoryManager.redo()
                                                    ↓
                                        Call stored redo() function from OperationCommit
```

## Key Design Decisions

1. **Leverage existing OperationService**: Instead of creating a new dispatcher, we use the already-established OperationService which provides history, telemetry, coalescing, and event emission.

2. **Operations-first**: Operations encapsulate mutation logic and provide undo/redo via `OperationCommit` closures.

3. **Thin commands, no command-owned undo**: Commands do not implement undo/redo; they only delegate to OperationService and are used for palette/shortcuts.

4. **OperationCommit**: Operations return commits with undo/redo closures and metadata for coalescing and scene diffing.

5. **Single source of truth**: OperationService is the only entry point for command execution, ensuring consistent lifecycle, history management, and event emission.

6. **No duplication**: We reuse existing HistoryManager, event system, and coalescing logic rather than reimplementing them.

## Testing the Implementation

To test undo/redo functionality:

1. **Open a scene** in the editor
2. **Select a node** in the scene tree
3. **Modify properties** in the inspector (e.g., change position.x from 0 to 5)
4. **Press Cmd+Z / Ctrl+Z**: Property should revert to 0
5. **Press Shift+Cmd+Z / Ctrl+Y**: Property should change back to 5
6. **Test selection**: Select multiple nodes, undo, redo
7. **Test multiple operations**: Make several changes, undo them one by one

## Future Enhancements

1. **History UI**: Add a history panel showing undo/redo stack
2. **Command grouping**: Batch related commands (e.g., all transform changes from a single drag)
3. **History persistence**: Save/load history with projects
4. **Selective undo**: Undo specific operations, not just the last one
5. **History coalescing**: Merge similar consecutive operations (e.g., continuous property changes)
6. **Undo limits**: Configure max history size per user preference

## Files Modified/Created

### Created:
- `src/core/features/selection/operations/SelectObjectOperation.ts`
- `src/core/features/properties/operations/UpdateObjectPropertyOperation.ts`
- `src/core/features/scene/operations/LoadSceneOperation.ts`
- `src/core/features/history/commands/UndoCommand.ts`
- `src/core/features/history/commands/RedoCommand.ts`

### Modified:
- `src/ui/pix3-editor-shell.ts` - Keyboard shortcuts wired to OperationService
- `src/ui/object-inspector/inspector-panel.ts` - Uses UpdateObjectPropertyOperation
- `src/ui/scene-tree/scene-tree-panel.ts` - Uses SelectObjectOperation
- `src/core/rendering/ViewportSelectionService.ts` - Uses SelectObjectOperation and property updates via operations

## Compliance with Architecture

This implementation follows the Pix3 architecture guidelines:
- ✅ OperationService is the single gateway for mutations and history
- ✅ Operations are idempotent and return commits for undo/redo
- ✅ Commands are thin and do not contain undo logic
- ✅ HistoryManager uses bounded stacks
- ✅ Services use dependency injection with `@injectable()` and `@inject()`
- ✅ UI components subscribe to state changes via Valtio

---

**Status**: ✅ Complete and aligned with operations-first model
