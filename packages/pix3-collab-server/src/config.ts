export const config = {
  PORT: parseInt(process.env.PORT || '4001', 10),
  DB_PATH: process.env.DB_PATH || './data/core.sqlite',
  HOCUSPOCUS_DB_PATH: process.env.HOCUSPOCUS_DB_PATH || './data/crdt.sqlite',
  PROJECTS_STORAGE_DIR: process.env.PROJECTS_STORAGE_DIR || './data/projects',
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
  PASSWORD_SALT_ROUNDS: parseInt(process.env.PASSWORD_SALT_ROUNDS || '10', 10),
  COLLABORATION_PATH: process.env.COLLABORATION_PATH || '/collaboration',
} as const;
