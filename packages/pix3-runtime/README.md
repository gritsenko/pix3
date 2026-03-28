### yalc workflow

# after changes in runtime 
cd pix3/packages/pix3-runtime && npm run yalc:publish
# in target game project:
yalc update
# or npm install - yalc will update automatically

### Hybrid ECS runtime hooks

`pix3-runtime` stays scene-graph-first, but now exposes `ECSService` for project-owned ECS worlds.

- `SceneService.getECSService()` returns the active runtime ECS coordinator.
- Systems can register `update` and `fixedUpdate` phases.
- `SceneRunner` executes ECS fixed steps before regular node/script `tick()` calls.

### Instanced rendering bridge

Use `InstancedMesh3D` when ECS data needs to drive large numbers of render instances efficiently.

- Bulk writes support packed matrices or SoA transform arrays.
- GPU uploads are batched until end-of-frame `flush()`.
- Runtime raycasts preserve the owning node and expose `instanceId` for instanced hits.