import { BoxGeometry, Mesh, MeshStandardMaterial, Color, BufferGeometry, Material } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';

export interface Mesh3DProps extends Omit<Node3DProps, 'type'> {
  geometry?: string;
  size?: [number, number, number];
  material?: { color?: string; roughness?: number; metalness?: number };
}

export class Mesh3D extends Node3D {
  private _geometry?: BufferGeometry;
  private _material?: Material;

  constructor(props: Mesh3DProps) {
    super(props, 'Mesh3D');

    const geometryKind = (props.geometry ?? 'box').toLowerCase();
    const size = props.size ?? [1, 1, 1];

    let geometry: BufferGeometry;
    switch (geometryKind) {
      case 'box':
      default:
        geometry = new BoxGeometry(size[0], size[1], size[2]);
        break;
    }

    const mat = props.material ?? {};
    const color = new Color(mat.color ?? '#4e8df5').convertSRGBToLinear();
    const roughness = typeof mat.roughness === 'number' ? mat.roughness : 0.35;
    const metalness = typeof mat.metalness === 'number' ? mat.metalness : 0.25;

    const material = new MeshStandardMaterial({ color, roughness, metalness });

    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `${this.name}-Mesh`;
    this.add(mesh);

    this._geometry = geometry;
    this._material = material;
  }

  dispose(): void {
    try { this._geometry?.dispose(); } catch {}
    try { (this._material as unknown as { dispose?: () => void })?.dispose?.(); } catch {}
  }
}
