import { Script } from '@pix3/runtime';

export class Events extends Script {
  onAttach(): void {
    this.node?.signal('game_over');
    this.node?.signal('level_complete');
    this.node?.signal('score_changed');
  }

  emitScoreChanged(score: number): void {
    this.node?.emit('score_changed', score);
  }

  emitGameOver(reason: string): void {
    this.node?.emit('game_over', reason);
  }

  emitLevelComplete(levelName: string): void {
    this.node?.emit('level_complete', levelName);
  }
}
