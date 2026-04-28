import { injectable } from '@/fw/di';

type AnimationEditorListener = (assetPath: string | null) => void;

@injectable()
export class AnimationEditorService {
  private activeAssetPath: string | null = null;
  private listeners = new Set<AnimationEditorListener>();

  getActiveAssetPath(): string | null {
    return this.activeAssetPath;
  }

  setActiveAssetPath(assetPath: string | null): void {
    const normalized = assetPath?.trim() || null;
    if (normalized === this.activeAssetPath) {
      return;
    }

    this.activeAssetPath = normalized;
    for (const listener of this.listeners) {
      listener(this.activeAssetPath);
    }
  }

  subscribe(listener: AnimationEditorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }
}