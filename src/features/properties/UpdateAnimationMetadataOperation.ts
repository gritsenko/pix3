import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { getAppStateSnapshot } from '@/state';
import { ProjectStorageService } from '@/services/ProjectStorageService';
import { normalizeAnimationResource, type AnimationResource } from '@pix3/runtime';
import {
  normalizeAnimationAssetPath,
  parseAnimationResourceText,
  serializeAnimationResource,
} from '@/features/scene/animation-asset-utils';

export interface UpdateAnimationMetadataOperationParams {
  animationResourcePath: string;
  nextResource?: AnimationResource;
  updater?: (resource: AnimationResource) => AnimationResource;
  label?: string;
}

export class UpdateAnimationMetadataOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'assets.update-animation-metadata',
    title: 'Update Animation Metadata',
    description: 'Update the JSON metadata stored in a .pix3anim asset',
    tags: ['asset', 'animation', 'properties'],
  };

  constructor(private readonly params: UpdateAnimationMetadataOperationParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const storage = context.container.getService<ProjectStorageService>(
      context.container.getOrCreateToken(ProjectStorageService)
    );
    const resourcePath = normalizeAnimationAssetPath(this.params.animationResourcePath);
    const previousText = await storage.readTextFile(resourcePath);
    const currentResource = parseAnimationResourceText(previousText);
    const nextResource = this.computeNextResource(currentResource);
    const nextText = serializeAnimationResource(nextResource);

    if (previousText === nextText) {
      return { didMutate: false };
    }

    await storage.writeTextFile(resourcePath, nextText);

    const beforeSnapshot = context.snapshot;
    const afterSnapshot = getAppStateSnapshot();

    return {
      didMutate: true,
      commit: {
        label: this.params.label ?? `Update animation asset: ${resourcePath}`,
        beforeSnapshot,
        afterSnapshot,
        undo: async () => {
          await storage.writeTextFile(resourcePath, previousText);
        },
        redo: async () => {
          await storage.writeTextFile(resourcePath, nextText);
        },
      },
    };
  }

  private computeNextResource(currentResource: AnimationResource): AnimationResource {
    if (this.params.nextResource) {
      return normalizeAnimationResource(this.params.nextResource);
    }

    if (this.params.updater) {
      return normalizeAnimationResource(this.params.updater(currentResource));
    }

    return currentResource;
  }
}
