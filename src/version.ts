export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: "0.8.7",
  build: 20,
  displayVersion: "v0.8.7 (build 20)",
  publishedAt: "2026-04-26T20:23:10.881Z",
};
