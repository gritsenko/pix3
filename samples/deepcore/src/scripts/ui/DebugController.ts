/** No-op stub — debug panels removed; replaced by pix3 Inspector property schemas. */
export class DebugController {
  constructor(
    _getLightParams: () => unknown,
    _setLightParams: (params: unknown) => void,
    _toggleDebugVisuals: () => void,
    _setParticleVisible: (v: boolean) => void,
    _setFeedbackVisible: (v: boolean) => void,
    _getZoom: () => number,
    _setZoom: (v: number) => void,
    _setShadows: (enabled: boolean) => void,
  ) { /* no-op */ }

  setDebugVisuals(_show: boolean): void { /* no-op */ }
  showPerformance(_show: boolean): void { /* no-op */ }
  updatePerformance(_metrics: unknown): void { /* no-op */ }
  dispose(): void { /* no-op */ }
}
