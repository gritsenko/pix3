import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateAudioPlayerOperation,
  type CreateAudioPlayerOperationParams,
} from '@/features/scene/CreateAudioPlayerOperation';

export class CreateAudioPlayerCommand extends CreateNodeBaseCommand<
  CreateAudioPlayerOperationParams,
  CreateNodeCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-audio-player',
    title: 'Create AudioPlayer',
    description: 'Create an audio playback node in the scene',
    keywords: ['create', 'audio', 'sound', 'player', 'node'],
  };

  constructor(params: CreateAudioPlayerOperationParams = {}) {
    super(
      params,
      operationParams => new CreateAudioPlayerOperation(operationParams),
      'An active scene is required to create an AudioPlayer'
    );
  }
}
