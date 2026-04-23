export interface EditorVersionInfo {
  version: string;
  build: number;
  displayVersion: string;
  publishedAt?: string;
}

export const CURRENT_EDITOR_VERSION: EditorVersionInfo = {
  version: "0.8.5",
  build: 13,
  displayVersion: "v0.8.5 (build 13)",
  publishedAt: "2026-04-23T14:31:45.641Z",
};
