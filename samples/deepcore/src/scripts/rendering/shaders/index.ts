import commonVert from './common.vert.glsl?raw';
import voxelVert from './voxel.vert.glsl?raw';

export const Shaders = {
  common: {
    vert: commonVert,
  },
  voxel: {
    vert: voxelVert,
  },
} as const;
