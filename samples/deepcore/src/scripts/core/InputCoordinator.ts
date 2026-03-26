import { type VoxelData } from '../world';
import { TOOL_PROPERTIES } from '../config';
import { ToolType } from './Types';

export interface PointerInteraction {
  id: number;
  screenX: number;
  screenY: number;
  hoveredBlock: VoxelData | null;
  isHolding: boolean;
  drillTarget: { x: number; y: number; z: number } | null;
  initialScreenX: number;
  initialScreenY: number;
  initialBlock: VoxelData | null;
}

export interface InputCallbacks {
  onTapStart: (pointerId: number, screenX: number, screenY: number, interaction: PointerInteraction) => void;
  onTapEnd: (pointerId: number, screenX: number, screenY: number, interaction: PointerInteraction) => void;
  onHoldStart: (pointerId: number, screenX: number, screenY: number, interaction: PointerInteraction) => void;
  onHoldEnd: (pointerId: number, interaction: PointerInteraction) => void;
  onMove: (pointerId: number, screenX: number, screenY: number, source: 'mouse' | 'pointer', interaction: PointerInteraction) => void;
  onCancel: (pointerId: number) => void;
}

export class InputCoordinator {
  private interactions: Map<number, PointerInteraction> = new Map();
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private callbacks: InputCallbacks;
  private maxPointerDrift: number = 90;

  constructor(callbacks: InputCallbacks) {
    this.callbacks = callbacks;
  }

  handlePointerDown(
    pointerId: number,
    screenX: number,
    screenY: number,
    hoveredBlock: VoxelData | null
  ): void {
    this.lastPointerX = screenX;
    this.lastPointerY = screenY;

    const interaction: PointerInteraction = {
      id: pointerId,
      screenX,
      screenY,
      hoveredBlock: null,
      isHolding: false,
      drillTarget: null,
      initialScreenX: screenX,
      initialScreenY: screenY,
      initialBlock: hoveredBlock,
    };

    this.interactions.set(pointerId, interaction);

    this.callbacks.onTapStart(pointerId, screenX, screenY, interaction);
  }

  handlePointerMove(
    pointerId: number,
    screenX: number,
    screenY: number,
    source: 'mouse' | 'pointer' = 'pointer',
    hoveredBlock: VoxelData | null
  ): void {
    this.lastPointerX = screenX;
    this.lastPointerY = screenY;

    const interaction = this.interactions.get(pointerId);
    if (!interaction) return;

    interaction.screenX = screenX;
    interaction.screenY = screenY;

    // If hovering block changed while holding, update drill target
    if (interaction.isHolding && interaction.drillTarget && hoveredBlock) {
      const currentTarget = interaction.drillTarget;
      if (
        hoveredBlock.x !== currentTarget.x ||
        hoveredBlock.y !== currentTarget.y ||
        hoveredBlock.z !== currentTarget.z
      ) {
        interaction.drillTarget = {
          x: hoveredBlock.x,
          y: hoveredBlock.y,
          z: hoveredBlock.z,
        };
      }
    }

    this.callbacks.onMove(pointerId, screenX, screenY, source, interaction);
  }

  handlePointerUp(
    pointerId: number,
    screenX: number,
    screenY: number,
    currentTool: ToolType,
    hoveredBlock: VoxelData | null
  ): boolean {
    const interaction = this.interactions.get(pointerId);
    if (!interaction) return false;

    const toolProps = TOOL_PROPERTIES[currentTool];
    const pointerDriftX = Math.abs(screenX - interaction.initialScreenX);
    const pointerDriftY = Math.abs(screenY - interaction.initialScreenY);
    const pointerDrift = Math.sqrt(pointerDriftX * pointerDriftX + pointerDriftY * pointerDriftY);

    const blockIsStable = !!(
      hoveredBlock &&
      interaction.initialBlock &&
      hoveredBlock.x === interaction.initialBlock.x &&
      hoveredBlock.y === interaction.initialBlock.y &&
      hoveredBlock.z === interaction.initialBlock.z
    );

    const shouldTap =
      blockIsStable &&
      pointerDrift <= this.maxPointerDrift &&
      toolProps.inputMode === 'tap' &&
      (toolProps.multiTouchAllowed || this.interactions.size <= 1);

    this.callbacks.onTapEnd(pointerId, screenX, screenY, interaction);

    this.interactions.delete(pointerId);

    return shouldTap;
  }

  handleHoldStart(
    pointerId: number,
    screenX: number,
    screenY: number,
    currentTool: ToolType,
    hoveredBlock: VoxelData | null
  ): boolean {
    const interaction = this.interactions.get(pointerId);
    if (!interaction) return false;

    interaction.isHolding = true;

    const toolProps = TOOL_PROPERTIES[currentTool];

    // Check multi-touch restriction for hold tools
    if (!toolProps.multiTouchAllowed) {
      for (const [id, other] of this.interactions) {
        if (id !== pointerId && other.isHolding && other.drillTarget) {
          return false;
        }
      }
    }

    if (currentTool === ToolType.DRILL && hoveredBlock) {
      interaction.drillTarget = {
        x: hoveredBlock.x,
        y: hoveredBlock.y,
        z: hoveredBlock.z,
      };
      this.callbacks.onHoldStart(pointerId, screenX, screenY, interaction);
      return true;
    }

    return false;
  }

  handleHoldEnd(pointerId: number): void {
    const interaction = this.interactions.get(pointerId);
    if (!interaction) return;

    if (interaction.isHolding && interaction.drillTarget) {
      this.callbacks.onHoldEnd(pointerId, interaction);
    }

    interaction.isHolding = false;
    interaction.drillTarget = null;
  }

  reset(): void {
    this.interactions.clear();
  }

  getActiveInteractions(): PointerInteraction[] {
    return Array.from(this.interactions.values());
  }

  getInteractionCount(): number {
    return this.interactions.size;
  }

  getLastPointerPosition(): { x: number; y: number } {
    return { x: this.lastPointerX, y: this.lastPointerY };
  }

  getFirstActiveInteraction(): PointerInteraction | null {
    const first = this.interactions.values().next();
    return first.done ? null : first.value;
  }
}
