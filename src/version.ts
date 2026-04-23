export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: "0.8.6",
  build: 14,
  displayVersion: "v0.8.6 (build 14)",
  publishedAt: "2026-04-23T14:52:40.277Z",
};
