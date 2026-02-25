import { injectable, inject } from '@/fw/di';
import { appState } from '@/state';
import { ViewportRendererService } from '@/services/ViewportRenderService';

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

@injectable()
export class Navigation2DController {
  @inject(ViewportRendererService)
  private readonly viewportRenderer!: ViewportRendererService;

  private activePan: PanState | null = null;

  private get panSensitivity(): number {
    return appState.ui.navigation2D?.panSensitivity ?? 0.75;
  }

  private get zoomSensitivity(): number {
    return appState.ui.navigation2D?.zoomSensitivity ?? 0.001;
  }

  handleWheel(event: WheelEvent): void {
    if (appState.ui.navigationMode !== '2d') {
      return;
    }

    event.preventDefault();

    const target = event.target as HTMLElement;
    if (target.closest('.top-toolbar')) {
      return;
    }

    if (event.deltaZ !== 0 || event.ctrlKey) {
      this.handleZoom(event);
      return;
    }

    if (event.shiftKey) {
      this.handleHorizontalPan(event);
      return;
    }

    this.handleVerticalPan(event);
  }

  startPan(pointerId: number, x: number, y: number): void {
    if (appState.ui.navigationMode !== '2d') {
      return;
    }

    this.activePan = {
      pointerId,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
    };
  }

  updatePan(x: number, y: number): void {
    if (!this.activePan || appState.ui.navigationMode !== '2d') {
      return;
    }

    const deltaX = x - this.activePan.lastX;
    const deltaY = y - this.activePan.lastY;

    this.activePan.lastX = x;
    this.activePan.lastY = y;

    this.viewportRenderer.pan2D(-deltaX, -deltaY);
  }

  endPan(): void {
    this.activePan = null;
  }

  private handleZoom(event: WheelEvent): void {
    const zoomDelta = event.deltaZ !== 0 ? event.deltaZ : event.deltaY;
    const zoomFactor = 1 - zoomDelta * this.zoomSensitivity;
    this.viewportRenderer.zoom2D(zoomFactor);
  }

  private handleVerticalPan(event: WheelEvent): void {
    let deltaY = event.deltaY;
    if (event.deltaMode === 0) {
      deltaY = deltaY * this.panSensitivity;
    } else {
      deltaY = deltaY * this.panSensitivity * 10;
    }
    this.viewportRenderer.pan2D(0, deltaY);
  }

  private handleHorizontalPan(event: WheelEvent): void {
    let deltaX = event.deltaX;
    if (event.deltaX === 0 && event.deltaY !== 0) {
      deltaX = event.deltaY;
    }
    if (event.deltaMode === 0) {
      deltaX = deltaX * this.panSensitivity;
    } else {
      deltaX = deltaX * this.panSensitivity * 10;
    }
    this.viewportRenderer.pan2D(deltaX, 0);
  }
}
