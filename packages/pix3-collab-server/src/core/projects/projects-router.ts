import { Router, Response, NextFunction } from 'express';
import { attachOptionalAuth, requireAuth, AuthenticatedRequest } from '../auth/auth-middleware.js';
import * as projectsService from './projects-service.js';

export const projectsRouter = Router();

// Middleware: check project access for routes with :id param
function requireProjectAccess(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const projectId = req.params.id;
    const userId = req.user!.id;

    const project = projectsService.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const role = projectsService.getUserRole(projectId, userId);
    if (!role || (allowedRoles.length > 0 && !allowedRoles.includes(role))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    next();
  };
}

// GET /api/projects — list user's projects
projectsRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const projects = projectsService.listUserProjects(req.user!.id);
  res.json(projects);
});

// POST /api/projects — create new project
projectsRouter.post('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Project name is required' });
    return;
  }

  const project = projectsService.createProject(req.user!.id, name.trim());
  res.status(201).json(project);
});

// GET /api/projects/:id/access — project metadata with share-token-aware access check
projectsRouter.get(
  '/:id/access',
  attachOptionalAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const shareTokenHeader = req.header('x-share-token');
    const access = projectsService.resolveProjectAccess(req.params.id, {
      userId: req.user?.id ?? null,
      shareToken: typeof shareTokenHeader === 'string' ? shareTokenHeader : null,
    });

    if (!access) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({
      id: access.project.id,
      name: access.project.name,
      role: access.role,
      auth_source: access.authSource,
      access_mode: access.accessMode,
      share_enabled: access.shareEnabled,
    });
  }
);

// POST /api/projects/:id/share — generate share token
projectsRouter.post(
  '/:id/share',
  requireAuth,
  requireProjectAccess('owner', 'editor'),
  (req: AuthenticatedRequest, res: Response) => {
    const token = projectsService.generateShareToken(req.params.id);
    res.json({ share_token: token });
  }
);

// DELETE /api/projects/:id/share — revoke share token
projectsRouter.delete(
  '/:id/share',
  requireAuth,
  requireProjectAccess('owner'),
  (req: AuthenticatedRequest, res: Response) => {
    projectsService.revokeShareToken(req.params.id);
    res.json({ ok: true });
  }
);

// DELETE /api/projects/:id — delete project
projectsRouter.delete(
  '/:id',
  requireAuth,
  requireProjectAccess('owner'),
  (req: AuthenticatedRequest, res: Response) => {
    projectsService.deleteProject(req.params.id);
    res.json({ ok: true });
  }
);
