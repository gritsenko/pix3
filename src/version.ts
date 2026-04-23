export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: '0.8.5',
  build: 12,
  displayVersion: 'v0.8.5 (build 12)',
  publishedAt: '2026-04-23T13:47:51.416Z',
};
