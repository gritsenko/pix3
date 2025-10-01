import {
  CommandBase,
  type CommandContext,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandUndoPayload,
} from '@/core/commands/command';
import type { PersonaId, PanelVisibilityState } from '@/state';

export interface ApplyLayoutPresetCommandOptions {
  readonly persona: PersonaId;
  readonly panelVisibility?: PanelVisibilityState;
}

interface ApplyLayoutPresetPayload {
  readonly previousPersona: PersonaId;
  readonly previousPresetId: PersonaId;
  readonly previousLayoutReady: boolean;
  readonly previousPanelVisibility: PanelVisibilityState;
  readonly nextPersona: PersonaId;
  readonly nextPanelVisibility: PanelVisibilityState;
}

export class ApplyLayoutPresetCommand extends CommandBase<
  ApplyLayoutPresetPayload,
  ApplyLayoutPresetPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'layout.apply-persona-preset',
    title: 'Apply Persona Layout Preset',
    description:
      'Aligns the editor layout to persona defaults and marks the Golden Layout shell as initialized.',
    personas: ['technical-artist', 'gameplay-engineer', 'playable-ad-producer'],
    keywords: ['layout', 'persona', 'golden layout'],
  } as const;

  private readonly options: ApplyLayoutPresetCommandOptions;

  constructor(options: ApplyLayoutPresetCommandOptions) {
    super();
    this.options = options;
  }

  execute(context: CommandContext): CommandExecutionResult<ApplyLayoutPresetPayload> {
    const { state } = context;
    const { persona, panelVisibility } = this.options;

    const previousPersona = state.ui.persona;
    const previousPresetId = state.ui.layoutPresetId;
    const previousLayoutReady = state.ui.isLayoutReady;
    const previousPanelVisibility = { ...state.ui.panelVisibility };

    const nextPanelVisibility = panelVisibility
      ? { ...panelVisibility }
      : { ...previousPanelVisibility };

    const didMutate =
      previousPersona !== persona ||
      previousPresetId !== persona ||
      previousLayoutReady === false ||
      !this.arePanelVisibilitiesEqual(previousPanelVisibility, nextPanelVisibility);

    if (!didMutate) {
      return {
        didMutate: false,
        payload: {
          previousPersona,
          previousPresetId,
          previousLayoutReady,
          previousPanelVisibility: { ...previousPanelVisibility },
          nextPersona: persona,
          nextPanelVisibility,
        },
      };
    }

    state.ui.persona = persona;
    state.ui.layoutPresetId = persona;
    state.ui.panelVisibility = nextPanelVisibility;
    state.ui.isLayoutReady = true;
    state.ui.focusedPanelId = 'viewport';

    return {
      didMutate: true,
      payload: {
        previousPersona,
        previousPresetId,
        previousLayoutReady,
        previousPanelVisibility,
        nextPersona: persona,
        nextPanelVisibility,
      },
    };
  }

  postCommit(
    _context: CommandContext,
    payload: ApplyLayoutPresetPayload
  ): CommandUndoPayload<ApplyLayoutPresetPayload> {
    return payload;
  }

  private arePanelVisibilitiesEqual(a: PanelVisibilityState, b: PanelVisibilityState): boolean {
    return (
      a.sceneTree === b.sceneTree &&
      a.viewport === b.viewport &&
      a.inspector === b.inspector &&
      a.assetBrowser === b.assetBrowser
    );
  }
}
