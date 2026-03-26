import { type RenderingFullConfig, type ExposureConfig } from './types';
import wallTileUrl from '../../assets/models/walltile.glb?url';

export const renderingConfig: RenderingFullConfig = {
  camera: {
    pitch: Math.PI / 5, // ~36 degrees - classic isometric
    distance: 8,
    fov: 25,
    frustumSize: 8,
    portraitFitMargin: 0.3,
    near: 0.1,
    far: 1000,
    rotationSnap: Math.PI / 2,
    rotationLerpSpeed: 0.15
  },

  renderer: {
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
    maxPixelRatio: 2,
    shadowMapEnabled: true,
    clusterShadows: false,
    droppableShadows: false,
    shadowMapType: "PCFShadowMap",
    outputColorSpace: "SRGBColorSpace",
    toneMapping: "ACESFilmicToneMapping",
    toneMappingExposure: 1,
    bloomExposure: 1.5
  },

  lighting: {
    backgroundColor: 0x141322,
    fogDensity: 0.04,

    hemispheric: {
      skyColor: 0xffffff,
      groundColor: 0x554433,
      intensity: 0.2
    },

    sun: {
      color: 0xfff8e0,
      intensity: 1.5,
      position: {
        x: -25,
        y: 40,
        z: 20
      },
      shadowMapSize: 1024,
      shadowBias: -0.0005,
      shadowNormalBias: 0.02,
      shadowRadius: 2,
      shadowCamera: {
        near: 1,
        far: 150,
        left: -10,
        right: 10,
        top: 10,
        bottom: -10
      }
    }
  },

  blockRendering: {
    geometrySize: 1.0,
    maxVisibleDepth: 20, // Only render blocks within this vertical distance from camera
    envMapIntensity: 1.6,
  },

  wallPlanes: {
    modelPath: wallTileUrl,
    tileScale: 1.3,
    tileSpacing: 2.6,
    columnOffset: 1.3,
    visibleRows: 8,
    rowsBelow: 5,
    centerY: 0,
    offset: 0.1,
    color: 0xaaaaaa,
    maxOpacity: 1,
    fadeSpeed: 16.0,
  },

  depthMarkers: {
    interval: 5,
    planeWidth: 1.2,
    planeHeight: 0.6,
    offset: 0.6,
    color: '#ffcc00',
    fontSize: 56,
    textOutline: true,
  },
};

export const exposureConfig: ExposureConfig = {
  maxDistance: 3,
  nearBrightness: 0.3,
  minBrightness: 0.0,
};
