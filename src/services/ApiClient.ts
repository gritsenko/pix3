const SERVER_BASE_URL = import.meta.env.VITE_COLLAB_SERVER_URL || 'http://localhost:4001';
const BASE_URL = import.meta.env.DEV ? '' : SERVER_BASE_URL;
export const PROJECT_UPLOAD_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function getUploadLimitMessage(filePath?: string): string {
  const prefix = filePath ? `File ${filePath}` : 'File';
  return `${prefix} was rejected with HTTP 413. Pix3 server limit is ${formatBytes(PROJECT_UPLOAD_FILE_SIZE_LIMIT_BYTES)}, but an upstream proxy may enforce a lower limit.`;
}

export function formatUploadLimitBytes(bytes: number): string {
  return formatBytes(bytes);
}

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  is_admin: boolean;
  token?: string;
}

export interface ApiProject {
  id: string;
  owner_id: string;
  name: string;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiProjectAccess {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  auth_source: 'member' | 'share-token';
  access_mode: 'edit' | 'view';
  share_enabled: boolean;
}

export interface ManifestEntry {
  path: string;
  kind: 'file' | 'directory';
  size: number;
  hash: string;
  modified: string;
}

class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiClientError(getUploadLimitMessage(), res.status);
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiClientError(body.error ?? res.statusText, res.status);
  }
  return res.json() as Promise<T>;
}

function buildShareTokenHeaders(
  headers: HeadersInit | undefined,
  shareToken?: string
): HeadersInit | undefined {
  if (!shareToken) {
    return headers;
  }

  return {
    ...(headers ?? {}),
    'X-Share-Token': shareToken,
  };
}

// --- Auth ---

export function register(email: string, username: string, password: string): Promise<ApiUser> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
}

export function login(email: string, password: string): Promise<ApiUser> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<ApiUser> {
  return request('/api/auth/me');
}

// --- Projects ---

export function getProjects(): Promise<ApiProject[]> {
  return request('/api/projects');
}

export function createProject(name: string): Promise<ApiProject> {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function deleteProject(id: string): Promise<{ ok: boolean }> {
  return request(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function generateShareToken(id: string): Promise<{ share_token: string }> {
  return request(`/api/projects/${encodeURIComponent(id)}/share`, {
    method: 'POST',
  });
}

export function getProjectAccess(id: string, shareToken?: string): Promise<ApiProjectAccess> {
  return request(`/api/projects/${encodeURIComponent(id)}/access`, {
    headers: buildShareTokenHeaders(undefined, shareToken),
  });
}

export function revokeShareToken(id: string): Promise<{ ok: boolean }> {
  return request(`/api/projects/${encodeURIComponent(id)}/share`, {
    method: 'DELETE',
  });
}

// --- Storage ---

export function getManifest(projectId: string): Promise<{ files: ManifestEntry[] }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/manifest`);
}

export function getManifestWithAccess(
  projectId: string,
  shareToken?: string
): Promise<{ files: ManifestEntry[] }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/manifest`, {
    headers: buildShareTokenHeaders(undefined, shareToken),
  });
}

export async function downloadFile(
  projectId: string,
  filePath: string,
  shareToken?: string
): Promise<Response> {
  const res = await fetch(
    `${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/files/${filePath}`,
    {
      credentials: 'include',
      headers: buildShareTokenHeaders(undefined, shareToken),
    }
  );
  if (!res.ok) {
    throw new ApiClientError(`Failed to download ${filePath}`, res.status);
  }
  return res;
}

export async function uploadFile(
  projectId: string,
  filePath: string,
  content: Blob | ArrayBuffer | string
): Promise<{ path: string; size: number }> {
  const formData = new FormData();
  const blob =
    content instanceof Blob
      ? content
      : content instanceof ArrayBuffer
        ? new Blob([content])
        : new Blob([content], { type: 'text/plain' });
  formData.append('file', blob, filePath.split('/').pop() ?? 'file');

  const res = await fetch(
    `${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/files/${filePath}`,
    {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }
  );
  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiClientError(getUploadLimitMessage(filePath), res.status);
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiClientError(body.error ?? res.statusText, res.status);
  }
  return res.json();
}

export async function deleteFile(projectId: string, filePath: string): Promise<{ ok: boolean }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/files/${filePath}`, {
    method: 'DELETE',
  });
}

export async function createDirectory(
  projectId: string,
  directoryPath: string
): Promise<{ path: string }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/directories/${directoryPath}`, {
    method: 'POST',
  });
}

export function getBaseUrl(): string {
  return BASE_URL || SERVER_BASE_URL;
}

export { ApiClientError };
