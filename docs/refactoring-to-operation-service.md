# Refactoring Summary: Operations-first with OperationService

## Why the Refactor?

The initial implementation created `CommandDispatcherService` which duplicated functionality that already existed in `OperationService`. We first bridged Commands to Operations via an adapter. We have now fully adopted an operations-first model and deprecated the adapter in favor of direct OperationService usage and thin commands.

### What OperationService Already Provided:
✅ Command execution lifecycle  
✅ History integration (undo/redo)  
✅ Event emission (operation:invoked, operation:completed, etc.)  
✅ Command coalescing  
✅ Before/after snapshots  
✅ `undo()` and `redo()` methods  

## The Adopted Solution: Operations-first

Operations encapsulate mutations and provide undo/redo closures via `OperationCommit`. `OperationService` is the only gateway for invoking, undoing, and redoing. Commands are optional thin wrappers for palette/shortcut integration.

```typescript
// UI or tools invoke operations directly
await operationService.invokeAndPush(new UpdateObjectPropertyOperation({
  nodeId,
  propertyPath: path,
  value,
}));
```

## How It Works

1) Create operations that implement `perform()` and return an `OperationCommit` with `undo()` and `redo()` closures. Example operations now exist for selection, property updates, and scene loading under `src/core/features/*/operations`.
2) From UI, call `operationService.invoke(op)` or `invokeAndPush(op)` when the change should be undoable.
3) Thin commands in `src/core/features/*/commands` only validate preconditions and delegate to OperationService. Undo/redo commands call `operationService.undo()`/`redo()`.

### Usage in UI Components
```typescript
// Inspector panel example (no adapter):
@inject(OperationService) private readonly operationService!: OperationService;

async handlePropertyChange(nodeId: string, path: string, value: unknown) {
  await this.operationService.invokeAndPush(
    new UpdateObjectPropertyOperation({ nodeId, propertyPath: path, value })
  );
}
```

### Keyboard Shortcuts
```typescript
// Editor shell example:
@inject(OperationService)
private readonly operationService!: OperationService;

async handleUndo() {
  await this.operationService.undo(); // Direct call - no wrapper needed
}

async handleRedo() {
  await this.operationService.redo(); // Direct call - no wrapper needed
}
```

## Benefits of This Approach

1. **No Code Duplication**: Uses existing, tested OperationService
2. **Single Source of Truth**: All operations go through one service
3. **Existing Features**: Automatic access to coalescing, events, telemetry
4. **Cleaner Architecture**: Single source of truth for mutations and history
5. **Less Maintenance**: One system to maintain instead of two
6. **Better Integration**: UI and commands both use the same OperationService API

## What Changed

### Removed/Deprecated:
- ❌ `CommandDispatcherService.ts` (replaced by OperationService usage)
- ⚠️ `CommandOperationAdapter.ts` (deprecated; kept temporarily for reference if present)
- ⏩ Undo/Redo commands are thin wrappers that directly call OperationService

// Before:
@inject(CommandDispatcherService)
await this.commandDispatcher.execute(command);

// After:
@inject(OperationService)
private readonly operationService!: OperationService;
await this.operationService.invokeAndPush(wrapCommand(command));
```

## Comparison Snapshot

Operations-first vs legacy dispatcher/adapter:
- Single execution gateway (OperationService)
- Operations own undo/redo via commits
- Commands optional and thin
- UI can invoke operations directly

## Architecture Flow (Operations-first)

```
┌─────────────┐
│ UI Component│
└──────┬──────┘
       │ creates
       ▼
┌─────────────────┐
└──────┬──────────┘
       │ wraps via
       ▼
  │ invokes
       ▼
┌─────────────────┐
│ OperationService│
└──────┬──────────┘
       │ pushes to
       ▼
┌─────────────────┐
│ HistoryManager  │
└─────────────────┘
```

## Lessons Learned

1. **Always check existing infrastructure first** before creating new services
2. **Adapter pattern is powerful** for bridging different interfaces
3. **DRY principle applies to architecture** - avoid duplicating functionality
4. **Leverage existing, tested code** when possible

## Result

✅ Undo/redo via OperationService  
✅ Keyboard shortcuts work (Cmd+Z, Shift+Cmd+Z)  
✅ All mutations flow through a single service  
✅ Less code to maintain  
✅ Better alignment with the architecture  
✅ Clean build  

---

**This refactor demonstrates the importance of understanding existing architecture before implementing new features.**
