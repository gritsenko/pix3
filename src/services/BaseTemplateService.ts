import { injectable } from '@/fw/di';

import startupScene from './templates/startup-scene.pix3scene?raw';

export type TemplateScheme = 'templ';

type SceneTemplateId = 'startup-scene' | 'default';

interface SceneTemplateDescriptor {
  readonly id: SceneTemplateId;
  readonly contents: string;
  readonly title: string;
  readonly description?: string;
}

const sceneTemplates: SceneTemplateDescriptor[] = [
  {
    id: 'startup-scene',
    contents: startupScene,
    title: 'Startup Scene',
    description: 'Default Pix3 scene with environment root, basic lighting, camera, and UI sprite.',
  },
  {
    id: 'default',
    contents: startupScene,
    title: 'Default Scene',
    description: 'Fallback template used when a requested template is missing.',
  },
];

@injectable()
export class BaseTemplateService {
  private readonly sceneTemplateMap = new Map<string, SceneTemplateDescriptor>();

  constructor() {
    for (const descriptor of sceneTemplates) {
      this.sceneTemplateMap.set(descriptor.id, descriptor);
    }
  }

  getSceneTemplate(id: string): string {
    const descriptor = this.sceneTemplateMap.get(id) ?? this.sceneTemplateMap.get('default');
    if (!descriptor) {
      throw new Error(`No scene template registered for id "${id}".`);
    }
    return descriptor.contents;
  }

  resolveSceneTemplateFromUri(uri: string): string {
    const templateId = this.extractTemplateId(uri);
    return this.getSceneTemplate(templateId);
  }

  private extractTemplateId(uri: string): string {
    const match = /^templ:\/\/(.+)$/i.exec(uri.trim());
    if (!match) {
      throw new Error(`Unsupported template URI: ${uri}`);
    }
    return match[1] || 'default';
  }
}

export const DEFAULT_TEMPLATE_SCENE_ID = 'startup-scene';
