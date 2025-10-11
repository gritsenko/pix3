export { BulkOperationBuilder } from './BulkOperation';
export {
  createOperationContext,
  snapshotOperationState,
  type Operation,
  OperationBase,
  type OperationCommit,
  type OperationContext,
  type OperationInvokeOptions,
  type OperationInvokeResult,
  type OperationMetadata,
} from './Operation';
export {
  OperationService,
  type OperationEvent,
  type OperationEventListener,
} from './OperationService';
export {
  SelectObjectOperation,
  type SelectObjectParams,
} from '@/core/features/selection/operations/SelectObjectOperation';
export {
  UpdateObjectPropertyOperation,
  type UpdateObjectPropertyParams,
} from '@/core/features/properties/operations/UpdateObjectPropertyOperation';
export {
  LoadSceneOperation,
  type LoadSceneParams,
} from '@/core/features/scene/operations/LoadSceneOperation';
