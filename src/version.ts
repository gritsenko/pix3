export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: '0.8.2',
  build: 11,
  displayVersion: 'v0.8.2 (build 11)',
  publishedAt: '2026-04-07T18:30:51.575Z',
};
