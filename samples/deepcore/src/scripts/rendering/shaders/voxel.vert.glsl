// src/rendering/shaders/voxel.vert.glsl

#include <common>
#include <uv_pars_vertex>
#include <shadowmap_pars_vertex>

attribute float instanceAlpha;
attribute float instanceDamageStage;

varying vec2 vUv;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying float vInstanceAlpha;
varying float vDamageStage;
varying vec3 vPosLocal;

void main() {
    vUv = uv;
    vInstanceAlpha = instanceAlpha;
    vDamageStage = instanceDamageStage;
    vPosLocal = position;

    vec3 objectNormal = vec3( normal );
    vec3 transformed = vec3( position );

    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    vNormal = normalize(transformedNormal);

    #include <begin_vertex>
    #include <project_vertex>
    
    vViewPosition = - mvPosition.xyz;

    #include <worldpos_vertex>
    #include <shadowmap_vertex>
}
