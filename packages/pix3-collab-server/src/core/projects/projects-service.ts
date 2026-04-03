import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';
import { config } from '../../config.js';

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemberRow {
  project_id: string;
  user_id: string;
  role: string;
}

export interface ProjectAccessInfo {
  project: ProjectRow;
  role: 'owner' | 'editor' | 'viewer';
  authSource: 'member' | 'share-token';
  accessMode: 'edit' | 'view';
  shareEnabled: boolean;
}

export function listUserProjects(userId: string): ProjectRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT p.* FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.owner_id = ? OR pm.user_id = ?
       ORDER BY p.updated_at DESC`
    )
    .all(userId, userId) as ProjectRow[];
}

export function getProject(projectId: string): ProjectRow | undefined {
  return getDb()
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(projectId) as ProjectRow | undefined;
}

export function getProjectByShareToken(token: string): ProjectRow | undefined {
  return getDb()
    .prepare('SELECT * FROM projects WHERE share_token = ?')
    .get(token) as ProjectRow | undefined;
}

export function createProject(ownerId: string, name: string): ProjectRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO projects (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, ownerId, name, now, now);

  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(id, ownerId, 'owner');

  // Create project storage directory
  const projectDir = path.resolve(config.PROJECTS_STORAGE_DIR, id);
  fs.mkdirSync(projectDir, { recursive: true });

  return { id, owner_id: ownerId, name, share_token: null, created_at: now, updated_at: now };
}

export function deleteProject(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

  // Remove project storage directory
  const projectDir = path.resolve(config.PROJECTS_STORAGE_DIR, projectId);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

export function generateShareToken(projectId: string): string {
  const db = getDb();
  const token = crypto.randomBytes(24).toString('base64url');
  db.prepare('UPDATE projects SET share_token = ? WHERE id = ?').run(token, projectId);
  return token;
}

export function revokeShareToken(projectId: string): void {
  getDb().prepare('UPDATE projects SET share_token = NULL WHERE id = ?').run(projectId);
}

export function getUserRole(projectId: string, userId: string): string | null {
  const row = getDb()
    .prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId) as { role: string } | undefined;
  return row?.role ?? null;
}

export function resolveProjectAccess(
  projectId: string,
  options: {
    userId?: string | null;
    shareToken?: string | null;
  }
): ProjectAccessInfo | null {
  const project = getProject(projectId);
  if (!project) {
    return null;
  }

  const userId = options.userId?.trim();
  if (userId) {
    const role = getUserRole(projectId, userId);
    if (role === 'owner' || role === 'editor' || role === 'viewer') {
      return {
        project,
        role,
        authSource: 'member',
        accessMode: role === 'viewer' ? 'view' : 'edit',
        shareEnabled: project.share_token !== null,
      };
    }
  }

  const shareToken = options.shareToken?.trim();
  if (shareToken && project.share_token === shareToken) {
    return {
      project,
      role: 'viewer',
      authSource: 'share-token',
      accessMode: 'view',
      shareEnabled: true,
    };
  }

  return null;
}

export function touchProject(projectId: string): void {
  getDb()
    .prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?')
    .run(projectId);
}
