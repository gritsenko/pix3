export const config = {
  WS_PORT: parseInt(process.env.WS_PORT || '4000', 10),
  HTTP_PORT: parseInt(process.env.HTTP_PORT || '4001', 10),
  SQLITE_PATH: process.env.SQLITE_PATH || './data/pix3-projects.sqlite',
  PROJECTS_DIR: process.env.PROJECTS_DIR || './projects',
} as const;
