export const PERSONA_IDS = [
  'technical-artist',
  'gameplay-engineer',
  'playable-ad-producer',
] as const;

export type PersonaId = (typeof PERSONA_IDS)[number];

export const DEFAULT_PERSONA: PersonaId = 'technical-artist';

export const THEME_IDS = ['dark', 'light', 'high-contrast'] as const;

export type ThemeName = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeName = 'dark';

export type SceneLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface SceneDescriptor {
  id: string;
  /** File-system path relative to the project root, e.g. `res://scenes/level-1.pix3scene`. */
  filePath: string;
  name: string;
  version: string;
  isDirty: boolean;
  lastSavedAt: number | null;
}

export interface SceneHierarchyNode {
  id: string;
  name: string;
  type: string;
  instancePath: string | null;
  children: SceneHierarchyNode[];
}

export interface SceneHierarchyState {
  version: string | null;
  description: string | null;
  nodes: SceneHierarchyNode[];
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
}

export interface UIState {
  persona: PersonaId;
  theme: ThemeName;
  /** Persona-aligned Golden Layout preset identifier. */
  layoutPresetId: PersonaId;
  isLayoutReady: boolean;
  focusedPanelId: string | null;
  commandPaletteOpen: boolean;
  panelVisibility: PanelVisibilityState;
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
  selection: SelectionState;
  ui: UIState;
  operations: OperationState;
  telemetry: TelemetryState;
}

export const createInitialAppState = (): AppState => ({
  project: {
    directoryHandle: null,
    projectName: null,
    status: 'idle',
    errorMessage: null,
    recentProjects: [],
    lastOpenedScenePath: null,
  },
  scenes: {
    activeSceneId: SAMPLE_SCENE_DESCRIPTOR.id,
    descriptors: {
      [SAMPLE_SCENE_DESCRIPTOR.id]: SAMPLE_SCENE_DESCRIPTOR,
    },
    hierarchies: {
      [SAMPLE_SCENE_DESCRIPTOR.id]: SAMPLE_SCENE_HIERARCHY,
    },
    loadState: 'ready',
    loadError: null,
    lastLoadedAt: Date.now(),
    pendingScenePaths: [SAMPLE_SCENE_DESCRIPTOR.filePath],
  },
  selection: {
    nodeIds: [],
    primaryNodeId: null,
    hoveredNodeId: null,
  },
  ui: {
    persona: DEFAULT_PERSONA,
    theme: DEFAULT_THEME,
    layoutPresetId: DEFAULT_PERSONA,
    isLayoutReady: false,
    focusedPanelId: null,
    commandPaletteOpen: false,
    panelVisibility: {
      sceneTree: true,
      viewport: true,
      inspector: true,
      assetBrowser: true,
    },
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

const SAMPLE_SCENE_DESCRIPTOR: SceneDescriptor = {
  id: 'sample-orbit-runner',
  filePath: 'res://scenes/orbit-runner.pix3scene',
  name: 'Orbit Runner',
  version: '1.0.0',
  isDirty: false,
  lastSavedAt: null,
};

const SAMPLE_SCENE_HIERARCHY: SceneHierarchyState = {
  version: SAMPLE_SCENE_DESCRIPTOR.version,
  description: 'Starter scene with box, light, camera and logo sprite',
  metadata: {
    placeholder: true,
  },
  nodes: [
    {
      id: 'environment-root',
      name: 'Environment Root',
      type: 'Node3D',
      instancePath: null,
      children: [
        {
          id: 'main-camera',
          name: 'Main Camera',
          type: 'Node3D',
          instancePath: null,
          children: [],
        },
        {
          id: 'key-light',
          name: 'Key Light',
          type: 'Node3D',
          instancePath: null,
          children: [],
        },
        {
          id: 'demo-box',
          name: 'Demo Box',
          type: 'Node3D',
          instancePath: null,
          children: [],
        },
        {
          id: 'ui-layer',
          name: 'UI Layer',
          type: 'Node3D',
          instancePath: null,
          children: [
            {
              id: 'logo-sprite',
              name: 'Logo Sprite',
              type: 'Sprite2D',
              instancePath: null,
              children: [],
            },
          ],
        },
      ],
    },
  ],
};
