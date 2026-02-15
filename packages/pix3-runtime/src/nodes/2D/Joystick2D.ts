import {
    Mesh,
    MeshBasicMaterial,
    CircleGeometry,
    Vector2,
    Vector3,
} from 'three';
import { Node2D, type Node2DProps } from '../Node2D';
import type { PropertySchema } from '../../fw/property-schema';

export interface Joystick2DProps extends Node2DProps {
    radius?: number;
    handleRadius?: number;
    axisHorizontal?: string;
    axisVertical?: string;
    baseColor?: string;
    handleColor?: string;
}

export class Joystick2D extends Node2D {
    radius: number;
    handleRadius: number;
    axisHorizontal: string;
    axisVertical: string;
    baseColor: string;
    handleColor: string;

    private baseMesh: Mesh;
    private handleMesh: Mesh;

    // State
    private isDragging: boolean = false;
    private inputVector = new Vector2();

    constructor(props: Joystick2DProps) {
        super(props, 'Joystick2D');

        this.radius = props.radius ?? 50;
        this.handleRadius = props.handleRadius ?? 20;
        this.axisHorizontal = props.axisHorizontal ?? 'Horizontal';
        this.axisVertical = props.axisVertical ?? 'Vertical';
        this.baseColor = props.baseColor ?? '#ffffff';
        this.handleColor = props.handleColor ?? '#cccccc';

        // Create Visuals
        const baseGeo = new CircleGeometry(this.radius, 32);
        const baseMat = new MeshBasicMaterial({
            color: this.baseColor,
            transparent: true,
            opacity: 0.3,
            depthTest: false,
        });
        this.baseMesh = new Mesh(baseGeo, baseMat);
        this.baseMesh.renderOrder = 999;
        this.add(this.baseMesh);

        const handleGeo = new CircleGeometry(this.handleRadius, 32);
        const handleMat = new MeshBasicMaterial({
            color: this.handleColor,
            transparent: true,
            opacity: 0.8,
            depthTest: false,
        });
        this.handleMesh = new Mesh(handleGeo, handleMat);
        // Render handle on top of base
        this.handleMesh.position.z = 1;
        this.handleMesh.renderOrder = 1000;
        this.add(this.handleMesh);
    }

    override tick(dt: number): void {
        super.tick(dt);
        if (!this.input) return;

        if (!this.input.width) {
            // console.warn('[Joystick2D] InputService width is 0');
            return;
        }

        const pointer = this.input.pointerPosition;
        const isDown = this.input.isPointerDown;

        const worldPos = new Vector3();
        this.getWorldPosition(worldPos);

        const layoutX = pointer.x - this.input.width / 2;
        const layoutY = (this.input.height / 2) - pointer.y;

        const dx = layoutX - worldPos.x;
        const dy = layoutY - worldPos.y;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (this.isDragging) {
            if (!isDown) {
                console.log('[Joystick2D] Drag ended');
                this.isDragging = false;
                this.inputVector.set(0, 0);
                this.handleMesh.position.x = 0;
                this.handleMesh.position.y = 0;

                this.input.setAxis(this.axisHorizontal, 0);
                this.input.setAxis(this.axisVertical, 0);
            } else {
                const angle = Math.atan2(dy, dx);
                const clampDist = Math.min(dist, this.radius);

                const stickX = Math.cos(angle) * clampDist;
                const stickY = Math.sin(angle) * clampDist;

                this.handleMesh.position.x = stickX;
                this.handleMesh.position.y = stickY;

                this.inputVector.set(stickX / this.radius, stickY / this.radius);

                // console.log(`[Joystick2D] Input: ${this.inputVector.x.toFixed(2)}, ${this.inputVector.y.toFixed(2)}`);

                this.input.setAxis(this.axisHorizontal, this.inputVector.x);
                this.input.setAxis(this.axisVertical, this.inputVector.y);
            }
        } else {
            if (isDown && dist < this.radius) {
                console.log('[Joystick2D] Drag started');
                this.isDragging = true;
            }
        }
    }

    static getPropertySchema(): PropertySchema {
        const baseSchema = Node2D.getPropertySchema();
        return {
            nodeType: 'Joystick2D',
            extends: 'Node2D',
            properties: [
                ...baseSchema.properties,
                {
                    name: 'radius',
                    type: 'number',
                    ui: { label: 'Radius', group: 'Joystick' },
                    getValue: (n) => (n as Joystick2D).radius,
                    setValue: (n, v) => { (n as Joystick2D).radius = Number(v); },
                },
                {
                    name: 'axisHorizontal',
                    type: 'string',
                    ui: { label: 'Horz Axis', group: 'Input' },
                    getValue: (n) => (n as Joystick2D).axisHorizontal,
                    setValue: (n, v) => { (n as Joystick2D).axisHorizontal = String(v); },
                },
                {
                    name: 'axisVertical',
                    type: 'string',
                    ui: { label: 'Vert Axis', group: 'Input' },
                    getValue: (n) => (n as Joystick2D).axisVertical,
                    setValue: (n, v) => { (n as Joystick2D).axisVertical = String(v); },
                },
            ],
            groups: {
                ...baseSchema.groups,
                Joystick: { label: 'Joystick', expanded: true },
                Input: { label: 'Input Mapping', expanded: true },
            },
        };
    }
}
