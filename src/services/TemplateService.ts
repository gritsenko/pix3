import { injectable } from '@/fw/di';

import startupScene from '../templates/startup-scene.pix3scene?raw';
import testModelGlb from '../templates/Duck.glb?url';
import pix3LogoUrl from '../templates/pix3-logo.png?url';

export type TemplateScheme = 'templ';

type SceneTemplateId = 'startup-scene' | 'default';
type BinaryTemplateId = 'Duck.glb';
// Add any image or binary templates which should be resolved via templ://
type ImageTemplateId = 'pix3-logo.png';

interface SceneTemplateDescriptor {
  readonly id: SceneTemplateId;
  readonly contents: string;
  readonly title: string;
  readonly description?: string;
}

interface BinaryTemplateDescriptor {
  readonly id: BinaryTemplateId;
  readonly url: string;
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

const binaryTemplates: BinaryTemplateDescriptor[] = [
  {
    id: 'Duck.glb',
    url: testModelGlb,
  },
  {
    id: 'pix3-logo.png',
    url: pix3LogoUrl,
  },
];

@injectable()
export class TemplateService {
  private readonly sceneTemplateMap = new Map<string, SceneTemplateDescriptor>();
  private readonly binaryTemplateMap = new Map<string, BinaryTemplateDescriptor>();

  constructor() {
    for (const descriptor of sceneTemplates) {
      this.sceneTemplateMap.set(descriptor.id, descriptor);
    }
    for (const descriptor of binaryTemplates) {
      this.binaryTemplateMap.set(descriptor.id, descriptor);
    }
  }

  getSceneTemplate(id: string): string {
    const descriptor = this.sceneTemplateMap.get(id) ?? this.sceneTemplateMap.get('default');
    if (!descriptor) {
      throw new Error(`No scene template registered for id "${id}".`);
    }
    return descriptor.contents;
  }

  getBinaryTemplateUrl(id: string): string {
    const descriptor = this.binaryTemplateMap.get(id);
    if (!descriptor) {
      throw new Error(`No binary template registered for id "${id}".`);
    }
    return descriptor.url;
  }

  resolveSceneTemplateFromUri(uri: string): string {
    const templateId = this.extractTemplateId(uri);
    return this.getSceneTemplate(templateId);
  }

  resolveBinaryTemplateUrl(uri: string): string {
    const templateId = this.extractTemplateId(uri);
    return this.getBinaryTemplateUrl(templateId);
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

export type TemplateLookupError = Error & {
  readonly code: 'TEMPLATE_NOT_FOUND' | 'INVALID_TEMPLATE_URI';
};
