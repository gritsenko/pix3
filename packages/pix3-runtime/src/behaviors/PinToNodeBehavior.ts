import { Script } from '../core/ScriptComponent';
import { defineProperty } from '../fw/property-schema';
import { Vector3 } from 'three';
import { NodeBase } from '../nodes/NodeBase';
import { Node2D } from '../nodes/Node2D';
import { Object3D } from 'three';
import { Camera3D } from '../nodes/3D/Camera3D';

export class PinToNodeBehavior extends Script {
    targetNodeId: string = '';
    yOffset: number = 2.0;

    private targetNode: NodeBase | null = null;
    private cameraNode: Camera3D | null = null;
    private _tempVec = new Vector3();

    static override getPropertySchema() {
        return {
            nodeType: 'PinToNodeBehavior',
            properties: [
                defineProperty('targetNodeId', 'node', {
                    ui: { label: 'Target Model', nodeTypes: ['MeshInstance', 'Node3D', 'Sprite3D'] },
                    getValue: (c: unknown) => (c as PinToNodeBehavior).targetNodeId,
                    setValue: (c: unknown, v: unknown) => { (c as PinToNodeBehavior).targetNodeId = String(v); },
                }),
                defineProperty('yOffset', 'number', {
                    ui: { label: 'Y Offset', step: 0.1 },
                    getValue: (c: unknown) => (c as PinToNodeBehavior).yOffset,
                    setValue: (c: unknown, v: unknown) => { (c as PinToNodeBehavior).yOffset = Number(v); },
                }),
            ],
            groups: {}
        };
    }

    override onStart() {
        this.targetNode = null;
        this.cameraNode = null;

        if (!this.node || !this.targetNodeId) return;

        // Traverse up to find root
        let root = this.node;
        while (root.parentNode) {
            root = root.parentNode;
        }

        // Resolve target node
        this.targetNode = root.findById(this.targetNodeId);

        // Find the active Camera3D
        this.findCamera(root);
    }

    private findCamera(node: NodeBase) {
        if (node instanceof Camera3D) {
            this.cameraNode = node;
            return;
        }
        for (const child of node.children) {
            if (child instanceof NodeBase) {
                this.findCamera(child);
                if (this.cameraNode) return;
            }
        }
    }

    override onUpdate(_dt: number) {
        if (!this.targetNode || !this.node || !this.cameraNode || !(this.node instanceof Node2D)) {
            // Re-try finding the target and camera if they were missing or added later
            if (!this.targetNode || !this.cameraNode) {
                let root = this.node;
                while (root?.parentNode) root = root.parentNode;
                if (root) {
                    if (!this.targetNode && this.targetNodeId) this.targetNode = root.findById(this.targetNodeId);
                    if (!this.cameraNode) this.findCamera(root);
                }
            }
            return;
        }

        const targetObj = this.targetNode as unknown as Object3D;
        const cameraObj = this.cameraNode.camera;

        if (!targetObj || !cameraObj) return;

        // Get world position of the target and apply Y offset
        targetObj.updateMatrixWorld(true);
        this._tempVec.setFromMatrixPosition(targetObj.matrixWorld);
        this._tempVec.y += this.yOffset;

        // Project 3D vector to 2D screen space using the camera
        this._tempVec.project(cameraObj);

        // Convert from normalized device coordinates (-1 to +1) to screen coordinates.
        // Assuming UI space mapping here. For Pix3, the root layout container handles layout sizing.
        // If the 2D layout matches window innerWidth / innerHeight, we map it directly:
        const width = window.innerWidth;
        const height = window.innerHeight;

        const screenX = (this._tempVec.x * 0.5 + 0.5) * width;
        const screenY = (-(this._tempVec.y * 0.5) + 0.5) * height;

        // Update the position of this 2D node
        this.node.position.set(screenX, screenY, 0);
    }
}
