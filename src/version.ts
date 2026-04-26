export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: "0.8.7",
  build: 27,
  displayVersion: "v0.8.7 (build 27)",
  publishedAt: "2026-04-26T21:41:40.199Z",
};
