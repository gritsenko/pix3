export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: "0.8.8",
  build: 31,
  displayVersion: "v0.8.8 (build 31)",
  publishedAt: "2026-04-27T21:28:59.092Z",
};
