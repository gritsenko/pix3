import { BulkOperationBuilder } from '@/core/BulkOperation';
import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { getAppStateSnapshot } from '@/state';
import { UpdateObjectPropertyOperation } from '@/features/properties/UpdateObjectPropertyOperation';
import { normalizeAnimationAssetPath } from './animation-asset-utils';
import {
  CreateAnimationAssetOperation,
  type CreateAnimationAssetOperationParams,
} from './CreateAnimationAssetOperation';

export interface CreateAndBindAnimationAssetOperationParams
  extends CreateAnimationAssetOperationParams {
  nodeId: string;
  propertyPath?: string;
}

export class CreateAndBindAnimationAssetOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-and-bind-animation-asset',
    title: 'Create and Bind Animation Asset',
    description: 'Create a .pix3anim asset and bind it to a node in one history entry',
    tags: ['scene', 'animation', 'asset'],
  };

  constructor(private readonly params: CreateAndBindAnimationAssetOperationParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const assetPath = normalizeAnimationAssetPath(this.params.assetPath);
    const createOperation = new CreateAnimationAssetOperation({
      ...this.params,
      assetPath,
    });
    const createResult = await createOperation.perform(context);
    if (!createResult.didMutate || !createResult.commit) {
      return { didMutate: false };
    }

    const bindOperation = new UpdateObjectPropertyOperation({
      nodeId: this.params.nodeId,
      propertyPath: this.params.propertyPath ?? 'animationResourcePath',
      value: assetPath,
    });

    try {
      const bindResult = await bindOperation.perform(context);
      if (!bindResult.didMutate || !bindResult.commit) {
        await createResult.commit.undo();
        return { didMutate: false };
      }

      const builder = new BulkOperationBuilder();
      builder.add(createResult.commit);
      builder.add(bindResult.commit);
      const commit = builder.build(`Create animation asset: ${assetPath}`);

      return {
        didMutate: true,
        commit: {
          ...commit,
          beforeSnapshot: context.snapshot,
          afterSnapshot: getAppStateSnapshot(),
        },
      };
    } catch (error) {
      await createResult.commit.undo();
      throw error;
    }
  }
}
