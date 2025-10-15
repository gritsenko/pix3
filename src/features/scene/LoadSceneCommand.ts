import { injectable, inject } from '@/fw/di';
import { OperationService } from '@/services/OperationService';
import {
  LoadSceneOperation,
  type LoadSceneParams,
} from '@/features/scene/LoadSceneOperation';

export interface LoadSceneCommandParams {
  filePath: string; // res:// path
  sceneId?: string; // optional override id
}

export interface CommandResult<TUndo = unknown> {
  undo?: TUndo;
}

@injectable()
export class LoadSceneCommand {
  @inject(OperationService) private readonly operations!: OperationService;

  async execute(params: LoadSceneCommandParams): Promise<CommandResult> {
    const opParams: LoadSceneParams = { filePath: params.filePath, sceneId: params.sceneId };
    await this.operations.invoke(new LoadSceneOperation(opParams));
    return {};
  }
}
