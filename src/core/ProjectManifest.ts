export interface AutoloadConfig {
  scriptPath: string;
  singleton: string;
  enabled: boolean;
}

export interface ProjectManifest {
  version: string;
  autoloads: AutoloadConfig[];
  metadata?: Record<string, unknown>;
}

export const DEFAULT_PROJECT_MANIFEST_VERSION = '1.0.0';

export const createDefaultProjectManifest = (): ProjectManifest => ({
  version: DEFAULT_PROJECT_MANIFEST_VERSION,
  autoloads: [],
  metadata: {},
});

export const normalizeProjectManifest = (input: unknown): ProjectManifest => {
  if (!input || typeof input !== 'object') {
    return createDefaultProjectManifest();
  }

  const record = input as Record<string, unknown>;
  const rawAutoloads = Array.isArray(record.autoloads) ? record.autoloads : [];
  const autoloads: AutoloadConfig[] = [];

  for (const entry of rawAutoloads) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const autoload = entry as Record<string, unknown>;
    const scriptPath = typeof autoload.scriptPath === 'string' ? autoload.scriptPath.trim() : '';
    const singleton = typeof autoload.singleton === 'string' ? autoload.singleton.trim() : '';
    if (!scriptPath || !singleton) {
      continue;
    }

    autoloads.push({
      scriptPath,
      singleton,
      enabled: autoload.enabled !== false,
    });
  }

  return {
    version:
      typeof record.version === 'string' && record.version.trim().length > 0
        ? record.version
        : DEFAULT_PROJECT_MANIFEST_VERSION,
    autoloads,
    metadata:
      record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
};
