// Типы данных для конфигурации игры

// Типы, извлеченные из строк JSON
export type ToolTypeString = 'pickaxe' | 'shovel' | 'drill';
export type InputMode = 'tap' | 'hold';

// Определение типов блоков
export interface BlockTypes {
  AIR: number;
  BEDROCK: number;
  DIRT: number;
  STONE: number;
  IRON_ORE: number;
  SILVER_ORE: number;
  GOLD_ORE: number;
  DIAMOND_ORE: number;
  UNSTABLE: number;
}

// Параметры блока
export interface BlockPropertyData {
  hp: number;               // Здоровье
  density: number;          // Плотность (вес)
  hardness: number;         // Сопротивляемость урону
  adhesion: boolean;        // Способность держаться за соседей
  color: number;            // HEX цвет
  gripForce: number;        // Сила сцепления (множитель стабильности)
  fragility: number;        // Множитель урона от кинетической энергии (Glass = high, Iron = low)
  impactForce: number;      // Эффективность передачи энергии вниз (как молот)
  energyAbsorption: number; // Процент поглощения энергии при прохождении ударной волны (Dirt = high, Iron = low)
  mass: number;             // Масса для расчета кинетической энергии
  modelPath?: string;       // Путь к GLB модели (опционально)
  scale?: number;           // Scale factor for the model (default 1.0)
  randomRotation?: boolean; // Apply random Y rotation (90 degree steps)
  explosionRadius?: number; // Радиус взрыва
  explosionDamage?: number; // Урон от взрыва
}

export interface BlocksConfig {
  blockTypes: BlockTypes;
  blockProperties: Record<string, BlockPropertyData>;
}

// Tool Types
// Типы инструментов
export interface ToolTypes {
  PICKAXE: ToolTypeString;
  SHOVEL: ToolTypeString;
  DRILL: ToolTypeString;
}

// Параметры инструмента
export interface ToolPropertyData {
  baseDamage: number;       // Базовый урон
  stoneMultiplier: number;  // Множитель по камню
  dirtMultiplier: number;   // Множитель по земле
  inputMode: InputMode;     // Режим ввода (тап/удержание)
  fuelCost: number;         // Расход топлива
  multiTouchAllowed: boolean; // Поддержка мультитача
  tickRate?: number;        // Частота срабатывания (для удержания)
  impactType?: 'none' | 'damage' | 'stability'; // Тип воздействия на соседей
  impactRadius?: number;    // Радиус воздействия
  screenShake?: {
    amplitude: number;      // Shake intensity (0-1)
    duration: number;       // Shake duration in seconds
  };
}

// Настройки улучшений
export interface DamageUpgradeConfig {
  baseCost: number;
  costMultiplier: number;
  damageMultiplier: number;
}

export interface BotUpgradeConfig {
  cost: number;
}

export interface TurboFuelUpgradeConfig {
  cost: number;
  damageMultiplier: number;
}

export interface UpgradesConfig {
  damage: DamageUpgradeConfig;
  bot: BotUpgradeConfig;
  turboFuel: TurboFuelUpgradeConfig;
}

export interface MiningConfig {
  BASE_STAMINA_COST: number;
  DEPTH_THRESHOLD: number;
  HARDNESS_MULTIPLIER: number;
  MIN_DAMAGE_PERCENT: number;
  SWING_SPEED_PENALTY: number;
  MISS_CHANCE_GROWTH: number; // Increment of miss chance per depth unit above threshold
  MAX_MISS_CHANCE: number;   // Max clamped miss chance (e.g. 0.5 for 50%)
}

// Конфигурация инструментов
export interface ToolsConfig {
  toolTypes: ToolTypes;
  toolProperties: Record<ToolTypeString, ToolPropertyData>;
  upgrades: UpgradesConfig;
}

// Настройки физики
export interface PhysicsConfig {
  gravity: number;
  minImpactVelocity: number;
}

// Параметры сетки
export interface ScreenShakeConfig {
  amplitude?: number;        // Shake intensity (0-1)
  duration?: number;         // Shake duration in seconds
  defaultAmplitude?: number; // Default shake intensity (for fallback)
  defaultDuration?: number;  // Default shake duration (for fallback)
}

export interface GridConfig {
  width: number;
  depth: number;
  initialHeight: number;
  chunkSize: number;
  chunkHeight: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floatingOriginReset: number;
}

// Настройки инстансинга
export interface InstancedMeshConfig {
  maxInstancesPerType: number;
}

// Параметры падающих блоков
export interface FallingBlocksConfig {
  settleCheckInterval: number;
  settleVelocityThreshold: number;
  removeAfterSettle: number;
}

// Настройки падения кластеров через Tween
export interface ClusterFallingConfig {
  fallSpeed: number;           // Скорость падения (блоков в секунду)
  bounceDuration: number;      // Длительность отскока (сек)
  bounceHeight: number;        // Высота отскока (в блоках)
  bounceEasing: string;        // Тип изинга для отскока
  impactDamageMultiplier: number; // Множитель урона при приземлении
}

// Система стабильности
export interface StabilityConfig {
  checkInterval: number;           // Как часто проверять стабильность (с)
  wobblePerDamage: number;         // Сколько wobble добавляет единица урона
  wobbleDecayRate: number;          // Сколько wobble убирается в секунду
  shockwaveReach: number;          // Радиус ударной волны (соседи)
  shockwaveDecay: number;          // Коэффициент затухания ударной волны
  shockwaveIncludeTop: boolean;     // Передавать волну блоку сверху
  shockwaveIncludeBottom: boolean; // Передавать волну блоку снизу
  stabilityThreshold: number;       // Порог отрыва: <= 0 блок отрывается
}

// Полная физическая конфигурация
export interface PhysicsFullConfig {
  physics: PhysicsConfig;
  grid: GridConfig;
  instancedMesh: InstancedMeshConfig;
  fallingBlocks: FallingBlocksConfig;
  clusterFalling: ClusterFallingConfig;
  stability: StabilityConfig;
}

// Конфигурация камеры
export interface CameraConfig {
  pitch: number;
  distance: number;
  fov: number;
  frustumSize: number;
  portraitFitMargin: number;
  near: number;
  far: number;
  rotationSnap: number;
  rotationLerpSpeed: number;
}

// Параметры рендерера
export interface RendererConfig {
  antialias: boolean;
  powerPreference: string;
  alpha: boolean;
  maxPixelRatio: number;
  shadowMapEnabled: boolean;
  clusterShadows: boolean;
  droppableShadows: boolean;
  shadowMapType: string;
  outputColorSpace: string;
  toneMapping: string;
  toneMappingExposure: number;
  bloomExposure: number;
}

// Позиция источника света
export interface LightPosition {
  x: number;
  y: number;
  z: number;
}

// Камера теней
export interface ShadowCameraConfig {
  near: number;
  far: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Полусферический свет
export interface HemisphericLightConfig {
  skyColor: number;
  groundColor: number;
  intensity: number;
}

// Солнечный свет
export interface SunLightConfig {
  color: number;
  intensity: number;
  position: LightPosition;
  shadowMapSize: number;
  shadowBias: number;
  shadowNormalBias: number;
  shadowRadius?: number;
  shadowCamera: ShadowCameraConfig;
}

// Полная конфигурация освещения
export interface LightingConfig {
  backgroundColor: number;
  fogDensity: number;
  hemispheric: HemisphericLightConfig;
  sun: SunLightConfig;
}

// Визуализация блоков
export interface BlockRenderingConfig {
  geometrySize: number;      // Базовый размер куба
  maxVisibleDepth?: number;  // Максимальная глубина видимости вниз от камеры
  envMapIntensity: number;   // Environment map reflection intensity (0 = no env reflections)
}

export interface DamageMaskConfig {
  textureUrl: string;
  columns: number;
  rows: number;
  smoothingEnabled: boolean;
  strength: number;
}

// Visualisation of mine shaft walls
export interface WallPlanesConfig {
  modelPath: string;     // Path to wall tile model
  tileScale: number;     // Scale of the model
  tileSpacing: number;   // Vertical distance between tiles
  columnOffset: number;  // Horizontal offset for columns
  visibleRows: number;   // Number of rows to render in sliding window
  rowsBelow: number;     // How many rows to render below camera center
  centerY: number;       // Y position of wall center (for initial placement)
  offset: number;        // Distance from grid boundary
  color: number;         // Wall color (hex)
  maxOpacity: number;    // Maximum opacity (0-1)
  fadeSpeed: number;     // Fade transition speed
}

// Depth markers configuration
export interface DepthMarkersConfig {
  interval: number;       // Depth interval in meters between markers
  planeWidth: number;     // Width of depth marker plane
  planeHeight: number;    // Height of depth marker plane
  offset: number;         // Distance from wall
  color: string;          // Text color (hex string)
  fontSize: number;      // Font size in pixels
  textOutline: boolean;   // Draw outline for better visibility
}

// Full rendering configuration
export interface RenderingFullConfig {
  camera: CameraConfig;
  renderer: RendererConfig;
  lighting: LightingConfig;
  blockRendering: BlockRenderingConfig;
  wallPlanes: WallPlanesConfig;
  depthMarkers: DepthMarkersConfig;
}

// Exposure (openness) gradient configuration
export interface ExposureConfig {
  maxDistance: number;
  nearBrightness: number;
  minBrightness: number;
}

// Конфигурация геймплея
export interface SwipeHorizontalConfig {
  threshold: number;
  maxVerticalRatio: number;
  minVelocity: number;
  maxDuration: number;
}

export interface SwipeVerticalConfig {
  enabled: boolean;
  threshold: number;
  maxHorizontalRatio: number;
  sensitivity: number;
}

export interface TrackpadSwipeConfig {
  enabled: boolean;
  threshold: number;        // Pixels needed to trigger rotation
  sensitivity: number;      // Multiplier for deltaX
  resetTime: number;        // Time in ms to reset accumulation
}

export interface GestureDetectionConfig {
  decisionDistance: number;
  decisionTime: number;
}

export interface HoldConfig {
  threshold: number;
}

export interface TapConfig {
  maxDistance: number;
  maxDuration: number;
}

// Настройки ввода
export interface InputConfig {
  swipeHorizontal: SwipeHorizontalConfig;
  swipeVertical: SwipeVerticalConfig;
  trackpadSwipe: TrackpadSwipeConfig;
  gestureDetection: GestureDetectionConfig;
  hold: HoldConfig;
  tap: TapConfig;
}

// Начальное состояние игры
export interface InitialStateConfig {
  gold: number;
  gems: number;
  depth: number;
  maxDepth: number;
  fuel: number;
  maxFuel: number;
  damageLevel: number;
  toolDamageMultiplier: number;
  hasBot: boolean;
  turboFuel: number;
  maxTurboFuel: number;
  turboActive: boolean;
  debugVisuals: boolean;
  debugMode: boolean;
  showFPS: boolean;
  currentTool: ToolTypeString;
}

// Настройки частиц
export interface ParticlePoolConfig {
  initialSize: number;
  maxPoolSize: number;
  expandAmount: number;
}

export interface ParticleGeometryConfig {
  boxSize: number;
}

export interface PhysicsParticleConfig {
  count: number;
  gravity: number;
  velocityRange: number;
  velocityYMin: number;
  velocityYMax: number;
  scaleMin: number;
  scaleMax: number;
  lifeMin: number;
  lifeMax: number;
}

export type DebrisParticleConfig = PhysicsParticleConfig;
export interface HitParticleConfig extends PhysicsParticleConfig {
  brightness: number; // Brightness factor for hit particles (0-1)
}

export interface ImpactSparksConfig {
  maxPoolSize: number;
  burstCount: number;
  sparkColor: number;
  glowColor: number;
  glowOpacity: number;
  sparkRadius: number;
  sparkLength: number;
  glowSize: number;
  life: number;
  lifeDecay: number;
  glowFadeTime: number;
  gravity: number;
  speedMin: number;
  speedMax: number;
  drag: number;
  spawnJitter: number;
  scaleMin: number;
  scaleMax: number;
  renderOrder: number;
  glowTextureSize: number;
}

export interface ExplosionImpactSparksConfig {
  burstCount: number;
  speedMinMultiplier: number;
  speedMaxMultiplier: number;
  scaleMinMultiplier: number;
  scaleMaxMultiplier: number;
  glowSizeMultiplier: number;
  spawnJitterMultiplier: number;
}

export interface SparkleParticleConfig {
  countMin: number;
  countMax: number;
  velocity: number;
  velocityY: number;
  life: number;
  lifeVariation: number;
  gravity: number;
}

export interface CollectParticleConfig {
  count: number;
  velocity: number;
  velocityY: number;
  life: number;
}

export interface ParticleRotationSpeeds {
  x: number;
  y: number;
}

export interface ParticlesConfig {
  pool: ParticlePoolConfig;
  geometry: ParticleGeometryConfig;
  debris: DebrisParticleConfig;
  hit: HitParticleConfig;
  impactSparks: ImpactSparksConfig;
  explosionImpactSparks: ExplosionImpactSparksConfig;
  sparkle: SparkleParticleConfig;
  collect: CollectParticleConfig;
  rotationSpeeds: ParticleRotationSpeeds;
}

// Настройки обратной связи
export interface DamageNumbersConfig {
  normalSize: number;
  critSize: number;
  normalColor: string;
  critColor: string;
  duration: number;
  floatSpeed: number;
  // WebGL sprite rendering
  textureSize: { width: number; height: number };
  maxCached: number;
  maxActive: number;
  poolInitialSize: number;
  poolExpandAmount: number;
  // Scale-pop animation
  scalePopDuration: number;
  scalePopMax: number;
  // Ballistic trajectory
  trajectorySpeed: { x: number; y: number };
  trajectoryGravity: number;
  // Rendering
  renderOrder: number;
  spriteScale: number;
  heightOffset: number;
  initialOpacity: number;
}

export interface HPBarsConfig {
  width: number;
  height: number;
  borderRadius: number;
  cornerRadius: number;
  fillLerpSpeed: number;
  fadeInDuration: number;
  showDuration: number;
  fadeOutDuration: number;
  hideDuration: number;
  thresholdHigh: number;
  thresholdMedium: number;
  colorHigh: string;
  colorMedium: string;
  colorLow: string;
  // WebGL sprite rendering
  textureSize: { width: number; height: number };
  maxActive: number;
  poolInitialSize: number;
  poolExpandAmount: number;
  // Rendering
  renderOrder: number;
  spriteScale: number;
  offsetY: number;
  initialOpacity: number;
}

export interface FeedbackSparklesConfig {
  count: number;
  gravity: number;
  velocityRange: number;
  velocityYMin: number;
  velocityYMax: number;
  life: number;
  lifeVariation: number;
  scaleMin: number;
  scaleMax: number;
  rotationSpeedX: number;
  rotationSpeedZ: number;
  geometrySize: number;
  defaultColor: number;
}

export interface FeedbackConfig {
  enableHPBars: boolean;
  enableDamageNumbers: boolean;
  damageNumbers: DamageNumbersConfig;
  hpBars: HPBarsConfig;
  sparkles: FeedbackSparklesConfig;
}

// Режим турбо
export interface TurboModeConfig {
  fuelConsumptionRate: number;
}

// Настройки отладки
export interface DebugConfig {
  airWireframeWindow: number;
}

// Настройки глубины и доступности
export interface DepthRangeConfig {
  maxDepthRange: number;
}

export interface UnstableBlocksConfig {
  initialBrightnessMultiplier: number;
  maxBrightnessMultiplier: number;
  hitsToExplode: number;
  explodeOnlyFromToolHits: boolean;
  explodeOnZeroHpFromFalling: boolean;
  chainReactionDelayMs: number;
  maxQueuedExplosionsPerFrame: number;
}

// Общая геймплейная конфигурация
export interface GameplayFullConfig {
  input: InputConfig;
  initialState: InitialStateConfig;
  particles: ParticlesConfig;
  feedback: FeedbackConfig;
  turboMode: TurboModeConfig;
  debug: DebugConfig;
  depthRange: DepthRangeConfig;
  unstableBlocks: UnstableBlocksConfig;
  screenShake: ScreenShakeConfig;
  mining: MiningConfig;
}
