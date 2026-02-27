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
    private _tempWorldPos = new Vector3();
    private _tempPinnedWorldPos = new Vector3();
    private _tempPinnedLocalPos = new Vector3();

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
        this._tempWorldPos.setFromMatrixPosition(targetObj.matrixWorld);
        this._tempWorldPos.y += this.yOffset;

        // Project 3D vector to 2D screen space using the camera
        this._tempWorldPos.project(cameraObj);

        const viewport = this.getViewportSize();
        if (viewport.width <= 0 || viewport.height <= 0) return;

        // Convert NDC (-1..1) to the 2D world space used by SceneRunner's orthographic camera.
        this._tempPinnedWorldPos.set(
            this._tempWorldPos.x * (viewport.width * 0.5),
            this._tempWorldPos.y * (viewport.height * 0.5),
            0
        );

        const parent = this.node.parent;
        if (!parent) return;

        parent.updateMatrixWorld(true);
        this._tempPinnedLocalPos.copy(this._tempPinnedWorldPos);
        parent.worldToLocal(this._tempPinnedLocalPos);

        // Write local coordinates so pinning remains correct under scaled/moved parents (e.g. Layout2D).
        this.node.position.set(this._tempPinnedLocalPos.x, this._tempPinnedLocalPos.y, this.node.position.z);
    }

    private getViewportSize(): { width: number; height: number } {
        if (this.input && this.input.width > 0 && this.input.height > 0) {
            return { width: this.input.width, height: this.input.height };
        }

        const fallbackWidth = Math.max(1, Math.round(window.innerWidth * window.devicePixelRatio));
        const fallbackHeight = Math.max(1, Math.round(window.innerHeight * window.devicePixelRatio));
        return { width: fallbackWidth, height: fallbackHeight };
    }
}
