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
                    setValue: (c: unknown, v: unknown) => { 
                        (c as PinToNodeBehavior).setTargetNodeId(String(v));
                    },
                }),
                defineProperty('yOffset', 'number', {
                    ui: { label: 'Y Offset', step: 0.1 },
                    getValue: (c: unknown) => (c as PinToNodeBehavior).yOffset,
                    setValue: (c: unknown, v: unknown) => { 
                        (c as PinToNodeBehavior).yOffset = Number(v); 
                    },
                }),
            ],
            groups: {}
        };
    }

    setTargetNodeId(id: string) {
        this.targetNodeId = id;
        this.targetNode = null;
    }

    override onStart() {
        this.targetNode = null;
        this.cameraNode = null;

        if (!this.node || !this.targetNodeId) return;

        // Traverse up to find the THREE.Scene root
        let root: Object3D = this.node;
        while (root.parent) {
            root = root.parent;
        }

        // Resolve target node
        this.targetNode = this.findNodeById(root, this.targetNodeId);

        // Find the active Camera3D
        this.findCamera(root);
    }

    private findNodeById(root: Object3D, id: string): NodeBase | null {
        if (root instanceof NodeBase && root.nodeId === id) {
            return root;
        }
        for (const child of root.children) {
            const match = this.findNodeById(child, id);
            if (match) return match;
        }
        return null;
    }

    private findCamera(node: Object3D) {
        if (node instanceof Camera3D) {
            this.cameraNode = node;
            return;
        }
        for (const child of node.children) {
            this.findCamera(child);
            if (this.cameraNode) return;
        }
    }

    override onUpdate(_dt: number) {
        if (!this.targetNode || !this.node || !this.cameraNode || !(this.node instanceof Node2D)) {
            // Re-try finding the target and camera if they were missing or added later
            if (!this.targetNode || !this.cameraNode) {
                let root: Object3D | null = this.node;
                while (root?.parent) root = root.parent;
                if (root) {
                    if (!this.targetNode && this.targetNodeId) this.targetNode = this.findNodeById(root, this.targetNodeId);
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

        // Find Layout2D to get the correct resolution
        let layoutWidth = window.innerWidth;
        let layoutHeight = window.innerHeight;
        
        let current = this.node.parent;
        let layoutNode: any = null;
        
        // First try to find Layout2D in ancestors
        while (current) {
            if ((current as any).type === 'Layout2D') {
                layoutNode = current;
                break;
            }
            current = current.parent;
        }
        
        // If not found in ancestors, search the whole scene
        if (!layoutNode && this.node) {
            let root: Object3D = this.node;
            while (root.parent) root = root.parent;
            
            const findLayout = (node: Object3D): any => {
                if ((node as any).type === 'Layout2D') return node;
                for (const child of node.children) {
                    const found = findLayout(child);
                    if (found) return found;
                }
                return null;
            };
            layoutNode = findLayout(root);
        }
        
        if (layoutNode) {
            layoutWidth = layoutNode.width;
            layoutHeight = layoutNode.height;
        }

        // Convert from normalized device coordinates (-1 to +1) to Layout2D coordinates.
        // Layout2D origin (0,0) is at the center.
        const screenX = this._tempVec.x * (layoutWidth * 0.5);
        const screenY = this._tempVec.y * (layoutHeight * 0.5);

        // Update the position of this 2D node
        this.node.position.set(screenX, screenY, 0);
    }
}
