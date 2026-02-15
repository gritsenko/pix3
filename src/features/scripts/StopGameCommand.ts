import {
    CommandBase,
    type CommandExecutionResult,
} from '@/core/command';
import { appState } from '@/state';
import { EditorTabService } from '@/services/EditorTabService';

export class StopGameCommand extends CommandBase<void, void> {
    readonly metadata = {
        id: 'game.stop',
        title: 'Stop Game',
        description: 'Stop the game and close the tab',
        keywords: ['stop', 'game', 'close'],
        menuPath: 'game',
        shortcut: 'Shift+F5',
        addToMenu: true,
        menuOrder: 101,
    };

    private readonly editorTabService: EditorTabService;

    constructor(editorTabService: EditorTabService) {
        super();
        this.editorTabService = editorTabService;
    }

    async execute(): Promise<CommandExecutionResult<void>> {
        console.log('[StopGameCommand] Stopping game mode...');

        // 1. Update global state
        appState.ui.isPlaying = false;
        appState.ui.playModeStatus = 'stopped';

        // 2. Close Game Tab
        // We need to find the tab ID for the game view.
        // EditorTabService creates IDs as `${type}:${resourceId}`
        const gameTabResourceId = 'game-view-instance';
        const tabId = `game:${gameTabResourceId}`;

        await this.editorTabService.closeTab(tabId);

        console.log('[StopGameCommand] Game mode stopped.');

        return {
            didMutate: false,
            payload: undefined,
        };
    }
}
