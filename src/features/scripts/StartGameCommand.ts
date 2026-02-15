import {
    CommandBase,
    type CommandExecutionResult,
} from '@/core/command';
import { appState } from '@/state';
import { EditorTabService } from '@/services/EditorTabService';

export class StartGameCommand extends CommandBase<void, void> {
    readonly metadata = {
        id: 'game.start',
        title: 'Start Game',
        description: 'Start the game in a new tab',
        keywords: ['play', 'game', 'start'],
        menuPath: 'game',
        shortcut: 'F5',
        addToMenu: true,
        menuOrder: 100,
    };

    private readonly editorTabService: EditorTabService;

    constructor(editorTabService: EditorTabService) {
        super();
        this.editorTabService = editorTabService;
    }

    async execute(): Promise<CommandExecutionResult<void>> {
        console.log('[StartGameCommand] Starting game mode...');

        // 1. Update global state
        appState.ui.isPlaying = true;
        appState.ui.playModeStatus = 'playing';

        // 2. Open Game Tab
        // We use a fixed resource ID for the game view instance
        const gameTabResourceId = 'game-view-instance';

        // Open the tab, activate it
        await this.editorTabService.openResourceTab('game', gameTabResourceId, {}, true);

        console.log('[StartGameCommand] Game mode started.');

        return {
            didMutate: false,
            payload: undefined,
        };
    }
}
