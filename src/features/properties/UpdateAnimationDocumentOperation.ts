import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { getAppStateSnapshot, type AppState } from '@/state';
import {
  normalizeAnimationResource,
  type AnimationResource,
} from '@pix3/runtime';
import {
  deriveAnimationDocumentId,
  normalizeAnimationAssetPath,
  serializeAnimationResource,
} from '@/features/scene/animation-asset-utils';

export interface UpdateAnimationDocumentOperationParams {
  animationId?: string;
  animationResourcePath?: string;
  nextResource?: AnimationResource;
  updater?: (resource: AnimationResource) => AnimationResource;
  label?: string;
}

export class UpdateAnimationDocumentOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'animation.update-document',
    title: 'Update Animation Document',
    description: 'Update the in-memory animation document stored in editor state',
    tags: ['asset', 'animation', 'properties'],
  };

  constructor(private readonly params: UpdateAnimationDocumentOperationParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state } = context;
    const animationId = this.resolveAnimationId(state);
    const descriptor = state.animations.descriptors[animationId];
    const currentResource = state.animations.resources[animationId];

    if (!descriptor || !currentResource) {
      throw new Error(`Animation document not found: ${animationId}`);
    }

    const nextResource = this.computeNextResource(currentResource);
    if (serializeAnimationResource(currentResource) === serializeAnimationResource(nextResource)) {
      return { didMutate: false };
    }

    const beforeSnapshot = context.snapshot;

    state.animations.resources[animationId] = nextResource;
    descriptor.version = nextResource.version;
    descriptor.isDirty = true;

    const afterSnapshot = getAppStateSnapshot();

    return {
      didMutate: true,
      commit: {
        label: this.params.label ?? `Update animation document: ${descriptor.filePath}`,
        beforeSnapshot,
        afterSnapshot,
        undo: () => {
          this.restoreFromSnapshot(state, beforeSnapshot, animationId);
        },
        redo: () => {
          this.restoreFromSnapshot(state, afterSnapshot, animationId);
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

  private resolveAnimationId(state: AppState): string {
    if (this.params.animationId) {
      return this.params.animationId;
    }

    if (this.params.animationResourcePath) {
      const normalizedPath = normalizeAnimationAssetPath(this.params.animationResourcePath);
      const existingEntry = Object.entries(state.animations.descriptors).find(
        ([, descriptor]) => descriptor.filePath === normalizedPath
      );
      if (existingEntry) {
        return existingEntry[0];
      }

      return deriveAnimationDocumentId(normalizedPath);
    }

    if (state.animations.activeAnimationId) {
      return state.animations.activeAnimationId;
    }

    throw new Error('No animation document is active');
  }

  private restoreFromSnapshot(
    state: AppState,
    snapshot: ReturnType<typeof getAppStateSnapshot>,
    animationId: string
  ): void {
    const descriptor = snapshot.animations.descriptors[animationId];
    const resource = snapshot.animations.resources[animationId];
    if (descriptor) {
      state.animations.descriptors[animationId] = descriptor;
    }
    if (resource) {
      state.animations.resources[animationId] = normalizeAnimationResource(resource);
    }
    state.animations.activeAnimationId = snapshot.animations.activeAnimationId;
  }
}