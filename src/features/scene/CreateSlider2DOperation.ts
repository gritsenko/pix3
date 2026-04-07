import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Slider2D, type SceneGraph } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateSlider2DOperationParams {
  sliderName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateSlider2DOperation extends CreateNodeOperationBase<CreateSlider2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-slider2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Slider2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D slider in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'slider', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'Slider2D';
  }

  protected createNode(params: CreateSlider2DOperationParams, nodeId: string) {
    const sliderName = params.sliderName || 'Slider2D';
    const node = new Slider2D({
      id: nodeId,
      name: sliderName,
      position: params.position || new Vector2(100, 100),
      width: params.width,
      height: params.height,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
