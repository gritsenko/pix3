import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Joystick2D, type SceneGraph } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateJoystick2DOperationParams {
  joystickName?: string;
  radius?: number;
  handleRadius?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateJoystick2DOperation extends CreateNodeOperationBase<CreateJoystick2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-joystick2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Joystick2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D joystick in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'joystick', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'Joystick2D';
  }

  protected createNode(params: CreateJoystick2DOperationParams, nodeId: string) {
    const joystickName = params.joystickName || 'Joystick2D';
    const node = new Joystick2D({
      id: nodeId,
      name: joystickName,
      position: params.position || new Vector2(100, 100), // Default position for visibility
      radius: params.radius,
      handleRadius: params.handleRadius,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
