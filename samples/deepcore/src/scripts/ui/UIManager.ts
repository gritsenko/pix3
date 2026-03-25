/** No-op stub — UI panels removed; game configuration is handled via pix3 Inspector. */
export class UIManager {
  setLoadingProgress(_percent: number, _message?: string): void { /* no-op */ }
  hideLoading(): void { /* no-op */ }
  update(_fps?: number): void { /* no-op */ }
  playAttackAnimation(): void { /* no-op */ }
  updateBlockDebugInfo(_block: unknown, _chunkId?: string): void { /* no-op */ }
  updateItemDebugInfo(_item: unknown): void { /* no-op */ }
  updateResourceDebugInfo(_resource: unknown): void { /* no-op */ }
  setAvatarUISystem(_system: unknown): void { /* no-op */ }
  dispose(): void { /* no-op */ }
}
