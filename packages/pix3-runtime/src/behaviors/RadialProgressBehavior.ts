import { Mesh, Object3D, ShaderMaterial, type Material, type Texture } from 'three';
import { Script } from '../core/ScriptComponent';
import type { PropertySchema } from '../fw/property-schema';
import { Sprite2D } from '../nodes/2D/Sprite2D';

const VERTEX_SHADER = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */`
uniform sampler2D map;
uniform bool hasMap;
uniform vec3 color;
uniform float opacity;
uniform float progress;
uniform float startAngleCos;
uniform float startAngleSin;
uniform float direction;

varying vec2 vUv;

void main() {
  vec4 texColor = hasMap ? texture2D(map, vUv) : vec4(1.0);
  texColor.rgb *= color;

  vec2 uv = vUv - 0.5;
  // Rotate by -startAngle: new_x = cos*x - sin*y, new_y = sin*x + cos*y (clockwise rotation)
  // We rotate the uv point to align the start angle with "up" (positive y)
  vec2 rotated = vec2(
    startAngleCos * uv.x + startAngleSin * uv.y,
    -startAngleSin * uv.x + startAngleCos * uv.y
  );

  // atan(x, y) gives angle from +y axis (top), going clockwise for positive x
  float angle = atan(rotated.x * direction, rotated.y);

  const float TWO_PI = 6.28318530718;
  if (angle < 0.0) angle += TWO_PI;

  float threshold = clamp(progress, 0.0, 1.0) * TWO_PI;
  if (angle > threshold) {
    discard;
  }

  gl_FragColor = vec4(texColor.rgb, texColor.a * opacity);
}
`;

export class RadialProgressBehavior extends Script {
  private _value = 1.0;
  private _currentValue = 1.0;
  private _animationSpeed = 3.0;
  private _startAngle = 0.0;
  private _clockwise = true;
  private _opacity = 1.0;

  private _radialMaterial: ShaderMaterial | null = null;
  private _originalMaterial: Material | Material[] | null = null;
  private _spriteMesh: Mesh | null = null;
  private _lastKnownTexture: Texture | null = null;

  constructor(id: string, type: string) {
    super(id, type);
    this.config = {
      value: this._value,
      animationSpeed: this._animationSpeed,
      startAngle: this._startAngle,
      clockwise: this._clockwise,
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'RadialProgressBehavior',
      properties: [
        {
          name: 'value',
          type: 'number',
          ui: {
            label: 'Value',
            description: 'Target progress from 0.0 (empty) to 1.0 (full)',
            group: 'Progress',
            min: 0,
            max: 1,
            step: 0.01,
            precision: 2,
          },
          getValue: (c: unknown) => (c as RadialProgressBehavior).getValue(),
          setValue: (c: unknown, v: unknown) => (c as RadialProgressBehavior).setValue(Number(v)),
        },
        {
          name: 'animationSpeed',
          type: 'number',
          ui: {
            label: 'Animation Speed',
            description: 'How fast the progress bar animates (higher = faster)',
            group: 'Progress',
            min: 0,
            max: 20,
            step: 0.1,
            precision: 1,
          },
          getValue: (c: unknown) => (c as RadialProgressBehavior).getAnimationSpeed(),
          setValue: (c: unknown, v: unknown) => (c as RadialProgressBehavior).setAnimationSpeed(Number(v)),
        },
        {
          name: 'startAngle',
          type: 'number',
          ui: {
            label: 'Start Angle',
            description: 'Starting angle in degrees. 0 = top (12 o\'clock), 90 = right',
            group: 'Progress',
            min: -360,
            max: 360,
            step: 1,
            precision: 0,
            unit: '°',
          },
          getValue: (c: unknown) => Math.round((c as RadialProgressBehavior).getStartAngle() * (180 / Math.PI)),
          setValue: (c: unknown, v: unknown) => (c as RadialProgressBehavior).setStartAngle(Number(v) * (Math.PI / 180)),
        },
        {
          name: 'clockwise',
          type: 'boolean',
          ui: {
            label: 'Clockwise',
            description: 'Fill direction: clockwise or counter-clockwise',
            group: 'Progress',
          },
          getValue: (c: unknown) => (c as RadialProgressBehavior).getClockwise(),
          setValue: (c: unknown, v: unknown) => (c as RadialProgressBehavior).setClockwise(Boolean(v)),
        },
      ],
      groups: {
        Progress: {
          label: 'Radial Progress',
          description: 'Parameters for radial progress masking',
          expanded: true,
        },
      },
    };
  }

  onAttach(): void {
    if (!(this.node instanceof Sprite2D)) {
      console.warn('[RadialProgressBehavior] Must be attached to a Sprite2D node');
      return;
    }

    const object3d = this.node as unknown as Object3D;
    const spriteMesh = object3d.children.find((c): c is Mesh => c instanceof Mesh);
    if (!spriteMesh) {
      console.warn('[RadialProgressBehavior] No mesh found on Sprite2D');
      return;
    }

    this._spriteMesh = spriteMesh;
    this._originalMaterial = spriteMesh.material as Material | Material[];

    const originalMat = Array.isArray(spriteMesh.material)
      ? spriteMesh.material[0]
      : spriteMesh.material;

    const baseMat = originalMat as { map?: Texture | null; color?: { r: number; g: number; b: number }; opacity?: number };
    const tex = baseMat.map ?? null;
    this._lastKnownTexture = tex;
    this._opacity = baseMat.opacity ?? 1.0;

    this._radialMaterial = this._buildMaterial(tex, baseMat);
    spriteMesh.material = this._radialMaterial;

    this._currentValue = this._value;
    this._updateUniforms();
  }

  onUpdate(dt: number): void {
    if (!this._radialMaterial || !this._spriteMesh) return;

    // Animate current value toward target value
    const speed = this._animationSpeed;
    if (speed <= 0) {
      this._currentValue = this._value;
    } else {
      const diff = this._value - this._currentValue;
      const step = diff * Math.min(speed * dt, 1.0);
      this._currentValue += step;
      if (Math.abs(diff) < 0.0001) {
        this._currentValue = this._value;
      }
    }

    // Sync texture change from the sprite's original material (e.g., late-loaded texture)
    this._syncTexture();
    this._updateUniforms();
  }

  onDetach(): void {
    if (this._spriteMesh && this._originalMaterial !== null) {
      this._spriteMesh.material = this._originalMaterial as Material | Material[];
    }
  }

  getValue(): number { return this._value; }
  setValue(v: number): void {
    this._value = Math.max(0, Math.min(1, v));
    this.config.value = this._value;
  }

  getAnimationSpeed(): number { return this._animationSpeed; }
  setAnimationSpeed(v: number): void {
    this._animationSpeed = Math.max(0, v);
    this.config.animationSpeed = this._animationSpeed;
  }

  getStartAngle(): number { return this._startAngle; }
  setStartAngle(radians: number): void {
    this._startAngle = radians;
    this.config.startAngle = Math.round(radians * (180 / Math.PI));
    this._updateAngleUniforms();
  }

  getClockwise(): boolean { return this._clockwise; }
  setClockwise(v: boolean): void {
    this._clockwise = v;
    this.config.clockwise = v;
    if (this._radialMaterial) {
      this._radialMaterial.uniforms['direction'].value = v ? 1.0 : -1.0;
    }
  }

  private _buildMaterial(
    tex: Texture | null,
    baseMat: { color?: { r: number; g: number; b: number }; opacity?: number },
  ): ShaderMaterial {
    const r = baseMat.color?.r ?? 1;
    const g = baseMat.color?.g ?? 1;
    const b = baseMat.color?.b ?? 1;

    return new ShaderMaterial({
      uniforms: {
        map: { value: tex },
        hasMap: { value: tex !== null },
        color: { value: [r, g, b] },
        opacity: { value: this._opacity },
        progress: { value: this._currentValue },
        startAngleCos: { value: Math.cos(this._startAngle) },
        startAngleSin: { value: Math.sin(this._startAngle) },
        direction: { value: this._clockwise ? 1.0 : -1.0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
    });
  }

  private _syncTexture(): void {
    if (!this._originalMaterial || !this._radialMaterial) return;
    const origMat = Array.isArray(this._originalMaterial) ? this._originalMaterial[0] : this._originalMaterial;
    const currentTex = (origMat as { map?: Texture | null }).map ?? null;
    if (currentTex !== this._lastKnownTexture) {
      this._lastKnownTexture = currentTex;
      this._radialMaterial.uniforms['map'].value = currentTex;
      this._radialMaterial.uniforms['hasMap'].value = currentTex !== null;
    }
  }

  private _updateUniforms(): void {
    if (!this._radialMaterial) return;
    this._radialMaterial.uniforms['progress'].value = this._currentValue;
    this._radialMaterial.uniforms['opacity'].value = this._opacity;
  }

  private _updateAngleUniforms(): void {
    if (!this._radialMaterial) return;
    this._radialMaterial.uniforms['startAngleCos'].value = Math.cos(this._startAngle);
    this._radialMaterial.uniforms['startAngleSin'].value = Math.sin(this._startAngle);
  }
}
