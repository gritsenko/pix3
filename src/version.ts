export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: "0.8.1",
  build: 1,
  displayVersion: "v0.8.1 (build 1)",
  publishedAt: "2026-04-07T13:16:28.307Z",
};
