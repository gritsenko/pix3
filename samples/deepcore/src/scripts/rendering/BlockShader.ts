import * as THREE from 'three';
import { BLOCK_RENDERING } from '../config';

const FAKE_RIM_INTENSITY = 0.0;

type SupportedBlockMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

function isSupportedBlockMaterial(material: THREE.Material): material is SupportedBlockMaterial {
  return material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial;
}

function createGradientTexture(toonSteps: number): THREE.DataTexture {
  const stepSize = Math.max(2, Math.min(4, toonSteps));
  const colors = new Uint8Array(stepSize * 4);

  for (let i = 0; i < stepSize; i++) {
    let brightness = 0;

    if (toonSteps === 3) {
      if (i === 0) brightness = Math.round(0.15 * 255);
      if (i === 1) brightness = Math.round(0.7 * 255);
      if (i === 2) brightness = Math.round(1.0 * 255);
    } else {
      const t = i / (stepSize - 1);
      brightness = Math.round((0.25 + 0.75 * t) * 255);
    }

    colors[i * 4] = brightness;
    colors[i * 4 + 1] = brightness;
    colors[i * 4 + 2] = brightness;
    colors[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(colors, stepSize, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;

  return texture;
}

export function createSimpleToonMaterial(
  color: number,
  toonSteps: number = 3,
  map?: THREE.Texture
): THREE.MeshToonMaterial {
  const gradientTexture = createGradientTexture(toonSteps);

  return new THREE.MeshToonMaterial({
    color: color,
    gradientMap: gradientTexture,
    map: map || null,
  });
}

export function createBlockMaterial(
  color: number,
  map?: THREE.Texture,
  _bounds?: THREE.Box3,
  templateMaterial?: THREE.Material
): THREE.Material {
  const material: SupportedBlockMaterial = templateMaterial && isSupportedBlockMaterial(templateMaterial)
    ? templateMaterial.clone()
    : new THREE.MeshStandardMaterial({
        color,
        map: map || null,
        roughness: 0.85,
        metalness: 0.0,
      });

  material.color.set(color);
  material.map = map || material.map || null;
  material.transparent = true;
  material.depthWrite = true;
  material.fog = false;
  material.envMapIntensity = BLOCK_RENDERING.envMapIntensity;
  material.userData.isBlockMaterial = true; // tag so env map traverse only updates block materials
  material.side = material.side ?? THREE.FrontSide;
  material.needsUpdate = true;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimIntensity = { value: FAKE_RIM_INTENSITY };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        #ifdef USE_INSTANCING
          attribute float instanceAlpha;
          attribute float instanceHitFlash;
        #endif
        varying float vInstanceAlpha;
        varying float vInstanceHitFlash;
        varying vec3 vPosLocal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vInstanceAlpha = instanceAlpha;
          vInstanceHitFlash = instanceHitFlash;
        #else
          vInstanceAlpha = 1.0;
          vInstanceHitFlash = 0.0;
        #endif
        vPosLocal = position;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float rimIntensity;
        varying float vInstanceAlpha;
        varying float vInstanceHitFlash;
        varying vec3 vPosLocal;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Apply hit flash (emissive white glow - ignores lighting)
        if (vInstanceHitFlash > 0.0) {
          diffuseColor.rgb = vec3(1.0, 1.0, 1.0);
          diffuseColor.a = 1.0;
          totalEmissiveRadiance = vec3(1.0, 1.0, 1.0);
        }`
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        // Apply instance alpha (only when not flashing)
        if (vInstanceHitFlash <= 0.0) {
          diffuseColor.a *= vInstanceAlpha;
        }`
      )
      .replace(
        '#include <output_fragment>',
        `float rim = smoothstep(0.5, 1.0, 1.0 - max(dot(normalize(vViewPosition), normalize(normal)), 0.0));
        outgoingLight += vec3(rim * rimIntensity);
        #include <output_fragment>`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        // Override final color for hit flash (pure white, no lighting)
        if (vInstanceHitFlash > 0.0) {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }`
      );
  };

  material.customProgramCacheKey = () => 'block-material-v2';

  return material;
}

