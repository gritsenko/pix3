import { AudioPlayer, type SceneGraph } from '@pix3/runtime';
import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';

export interface CreateAudioPlayerOperationParams {
  nodeName?: string;
}

export class CreateAudioPlayerOperation extends CreateNodeOperationBase<CreateAudioPlayerOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-audio-player';
  }

  protected getMetadataTitle(): string {
    return 'Create AudioPlayer';
  }

  protected getMetadataDescription(): string {
    return 'Create an audio playback node in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', 'audio', 'node', 'player'];
  }

  protected getNodeTypeName(): string {
    return 'AudioPlayer';
  }

  protected createNode(params: CreateAudioPlayerOperationParams, nodeId: string) {
    const nodeName = params.nodeName ?? 'AudioPlayer';
    const node = new AudioPlayer({
      id: nodeId,
      name: nodeName,
      autoplay: false,
      loop: false,
      volume: 1,
      audioTrack: null,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
