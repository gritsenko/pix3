import type { ProjectManifest } from '@/core/ProjectManifest';

export const THEME_IDS = ['dark', 'light', 'high-contrast'] as const;

export type ThemeName = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeName = 'dark';

export type SceneLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type EditorTabType = 'scene' | 'prefab' | 'script' | 'texture' | 'game';

export interface CameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom?: number;
}

export interface TabSelectionState {
  nodeIds: string[];
  primaryNodeId: string | null;
}

export interface EditorTab {
  /** Unique tab id. Recommended: `${type}:${resourceId}`. */
  id: string;
  /** Resource identifier (e.g. `res://scenes/level.pix3scene`). */
  resourceId: string;
  type: EditorTabType;
  title: string;
  isDirty: boolean;
  /** Optional type-specific state (camera, selection, scroll position, etc.). */
  contextState?: {
    camera?: CameraState;
    selection?: TabSelectionState;
    [key: string]: unknown;
  };
}

export interface TabsState {
  tabs: EditorTab[];
  activeTabId: string | null;
}

export interface SceneDescriptor {
  id: string;
  /** File-system path relative to the project root, e.g. `res://scenes/level-1.pix3scene`. */
  filePath: string;
  name: string;
  version: string;
  isDirty: boolean;
  lastSavedAt: number | null;
  /** File system handle for opened scene files (from File System Access API). */
  fileHandle?: FileSystemFileHandle | null;
  /** Last known modification time of the file (ms), for change detection polling. */
  lastModifiedTime?: number | null;
}

export interface SceneHierarchyState {
  version: string | null;
  description: string | null;
  rootNodes: unknown[]; // NodeBase instances (avoiding circular dependency)
  metadata: Record<string, unknown>;
}

export interface ScenesState {
  /** Currently focused scene identifier. */
  activeSceneId: string | null;
  /** Map of all scene descriptors currently loaded into memory. */
  descriptors: Record<string, SceneDescriptor>;
  /** Parsed hierarchy data keyed by scene id for UI consumption. */
  hierarchies: Record<string, SceneHierarchyState>;
  loadState: SceneLoadState;
  loadError: string | null;
  /** Timestamp (ms) when the most recent scene finished loading. */
  lastLoadedAt: number | null;
  /** FIFO queue of scene file paths scheduled for loading. */
  pendingScenePaths: string[];
  /** Counter incremented when node data (properties, scripts) changes but hierarchy remains unchanged. */
  nodeDataChangeSignal: number;

  /** Per-scene camera state keyed by scene id. */
  cameraStates: Record<string, CameraState>;
}

export type ProjectStatus = 'idle' | 'selecting' | 'ready' | 'error';

export type ScriptLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ProjectState {
  /** Unique ID for the project (used for persistence). */
  id: string | null;
  /** Active project directory handle retrieved via the File System Access API. */
  directoryHandle: FileSystemDirectoryHandle | null;
  projectName: string | null;
  /** Absolute path on the local file system (e.g. /home/user/project). Used for VS Code integration. */
  localAbsolutePath: string | null;
  status: ProjectStatus;
  errorMessage: string | null;
  /** Recently opened project identifiers (storage implementation TBD). */
  recentProjects: string[];
  /** Last opened scene file relative to the project root. */
  lastOpenedScenePath: string | null;
  /** Asset browser expanded folder paths (persisted per project). */
  assetBrowserExpandedPaths: string[];
  /** Asset browser selected path (persisted per project). */
  assetBrowserSelectedPath: string | null;
  /** Current status of script compilation and loading. */
  scriptsStatus: ScriptLoadStatus;
  /** Signal counter incremented when project files change (triggers asset explorer refresh). */
  fileRefreshSignal: number;
  /** Signal counter incremented when scripts are recompiled. */
  scriptRefreshSignal: number;
  /** Directory path that was modified (e.g., 'Scenes' or 'Assets'). Used to refresh only affected folders. */
  lastModifiedDirectoryPath: string | null;
  /** Project manifest loaded from pix3project.yaml. */
  manifest: ProjectManifest | null;
}

export interface SelectionState {
  /** Nodes currently selected in the scene tree. */
  nodeIds: string[];
  /** Primary node (e.g., manipulator focus). */
  primaryNodeId: string | null;
  /** Node hovered by cursor-driven affordances. */
  hoveredNodeId: string | null;
}

export type FocusedArea = 'viewport' | 'scene-tree' | 'inspector' | 'assets' | null;

/**
 * Editor context state for keyboard shortcut execution context ("when" clauses).
 * Tracks which area of the editor is focused for context-sensitive shortcuts.
 */
export interface EditorContextState {
  /** Currently focused editor area/panel. */
  focusedArea: FocusedArea;
  /** True if an input element (input, textarea, contenteditable) has focus. */
  isInputFocused: boolean;
  /** True if a modal dialog is currently open. */
  isModalOpen: boolean;
}

export interface PanelVisibilityState {
  sceneTree: boolean;
  viewport: boolean;
  inspector: boolean;
  assetBrowser: boolean;
  assetsPreview: boolean;
  logs: boolean;
}

export type NavigationMode = '2d' | '3d';

export interface UIState {
  theme: ThemeName;
  isLayoutReady: boolean;
  focusedPanelId: string | null;
  commandPaletteOpen: boolean;
  panelVisibility: PanelVisibilityState;
  navigationMode: NavigationMode;
  /** Toggle for showing the 2D orthographic layer overlay */
  showLayer2D: boolean;
  /** Toggle for showing the 3D perspective layer */
  showLayer3D: boolean;
  /** Toggle for showing the 3D grid helper */
  showGrid: boolean;
  /** Toggle for editor viewport lighting and shadow preview */
  showLighting: boolean;
  /** Warn before leaving the page with unsaved changes */
  warnOnUnsavedUnload: boolean;
  /** Pause rendering when the window is unfocused for battery economy */
  pauseRenderingOnUnfocus: boolean;
  /** True when the scene is in play mode (scripts running) */
  isPlaying: boolean;
  playModeStatus: 'stopped' | 'playing' | 'paused';
}

export interface OperationState {
  /** True while a command/operation is executing. */
  isExecuting: boolean;
  /** Count of pending commands queued for execution. */
  pendingCommandCount: number;
  /** Identifier/name of the most recently executed command. */
  lastCommandId: string | null;
  /** Identifier of the last command that produced undo data. */
  lastUndoableCommandId: string | null;
}

export interface TelemetryState {
  lastEventName: string | null;
  unsentEventCount: number;
}

export interface AppState {
  project: ProjectState;
  scenes: ScenesState;
  tabs: TabsState;
  selection: SelectionState;
  editorContext: EditorContextState;
  ui: UIState;
  operations: OperationState;
  telemetry: TelemetryState;
}


export const createInitialAppState = (): AppState => ({
  project: {
    id: null,
    directoryHandle: null,
    projectName: null,
    localAbsolutePath: null,
    status: 'idle',
    errorMessage: null,
    recentProjects: [],
    lastOpenedScenePath: null,
    assetBrowserExpandedPaths: [],
    assetBrowserSelectedPath: null,
    scriptsStatus: 'idle',
    fileRefreshSignal: 0,
    scriptRefreshSignal: 0,
    lastModifiedDirectoryPath: null,
    manifest: null,
  },
  scenes: {
    activeSceneId: null,
    descriptors: {},
    hierarchies: {},
    loadState: 'idle',
    loadError: null,
    lastLoadedAt: null,
    pendingScenePaths: [],
    nodeDataChangeSignal: 0,
    cameraStates: {},
  },
  tabs: {
    tabs: [],
    activeTabId: null,
  },
  selection: {
    nodeIds: [],
    primaryNodeId: null,
    hoveredNodeId: null,
  },
  editorContext: {
    focusedArea: null,
    isInputFocused: false,
    isModalOpen: false,
  },
  ui: {
    theme: DEFAULT_THEME,
    isLayoutReady: false,
    focusedPanelId: null,
    commandPaletteOpen: false,
    panelVisibility: {
      sceneTree: true,
      viewport: true,
      inspector: true,
      assetBrowser: true,
      assetsPreview: true,
      logs: true,
    },
    navigationMode: '3d',
    showLayer2D: true,
    showLayer3D: true,
    showGrid: true,
    showLighting: true,
    warnOnUnsavedUnload: true,
    pauseRenderingOnUnfocus: true,
    isPlaying: false,
    playModeStatus: 'stopped',
  },
  operations: {
    isExecuting: false,
    pendingCommandCount: 0,
    lastCommandId: null,
    lastUndoableCommandId: null,
  },
  telemetry: {
    lastEventName: null,
    unsentEventCount: 0,
  },
});
