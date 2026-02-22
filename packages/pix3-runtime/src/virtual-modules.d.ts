declare module 'virtual:runtime-embedded-assets' {
  export interface EmbeddedAssetEntry {
    readonly base64: string;
    readonly mimeType?: string;
  }

  export const embeddedAssets: Record<string, EmbeddedAssetEntry>;
}