export const THEME_IDS = ['dark', 'light', 'high-contrast'] as const;

export type ThemeName = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeName = 'dark';

export type SceneLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type EditorTabType = 'scene' | 'prefab' | 'script' | 'texture';

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

export interface ProjectState {
  /** Active project directory handle retrieved via the File System Access API. */
  directoryHandle: FileSystemDirectoryHandle | null;
  projectName: string | null;
  status: ProjectStatus;
  errorMessage: string | null;
  /** Recently opened project identifiers (storage implementation TBD). */
  recentProjects: string[];
  /** Last opened scene file relative to the project root. */
  lastOpenedScenePath: string | null;
  /** Signal counter incremented when project files change (triggers asset explorer refresh). */
  fileRefreshSignal: number;
  /** Directory path that was modified (e.g., 'Scenes' or 'Assets'). Used to refresh only affected folders. */
  lastModifiedDirectoryPath: string | null;
}

export interface SelectionState {
  /** Nodes currently selected in the scene tree. */
  nodeIds: string[];
  /** Primary node (e.g., manipulator focus). */
  primaryNodeId: string | null;
  /** Node hovered by cursor-driven affordances. */
  hoveredNodeId: string | null;
}

export interface PanelVisibilityState {
  sceneTree: boolean;
  viewport: boolean;
  inspector: boolean;
  assetBrowser: boolean;
  logs: boolean;
}

export interface UIState {
  theme: ThemeName;
  isLayoutReady: boolean;
  focusedPanelId: string | null;
  commandPaletteOpen: boolean;
  panelVisibility: PanelVisibilityState;
  /** Toggle for showing the 2D orthographic layer overlay */
  showLayer2D: boolean;
  /** Toggle for showing the 3D perspective layer */
  showLayer3D: boolean;
  /** Toggle for showing the 3D grid helper */
  showGrid: boolean;
  /** True when the scene is in play mode (scripts running) */
  isPlaying: boolean;
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
  ui: UIState;
  operations: OperationState;
  telemetry: TelemetryState;
}

const STARTUP_SCENE_URI = 'templ://startup-scene';

export const createInitialAppState = (): AppState => ({
  project: {
    directoryHandle: null,
    projectName: null,
    status: 'idle',
    errorMessage: null,
    recentProjects: [],
    lastOpenedScenePath: null,
    fileRefreshSignal: 0,
    lastModifiedDirectoryPath: null,
  },
  scenes: {
    activeSceneId: null,
    descriptors: {},
    hierarchies: {},
    loadState: 'idle',
    loadError: null,
    lastLoadedAt: null,
    pendingScenePaths: [STARTUP_SCENE_URI],
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
      logs: true,
    },
    showLayer2D: true,
    showLayer3D: true,
    showGrid: true,
    isPlaying: false,
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
