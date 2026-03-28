ECS и InstancedMesh3D — нововведения (2026-03-27)

Кратко
-----
Добавлена экспериментальная интеграция ECS и высокопроизводительного `InstancedMesh3D` в пакет `pix3-runtime`. Цель — позволить проектам запускать проектно-управляемые ECS-worlds для большой симуляции и эффективно рендерить множество объектов через единичную инстансированную меш-структуру.

Ключевые изменения
-----------------
- **ECSService** — новый координационный сервис для регистрации и управления жизненным циклом ECS-worlds и систем (registerWorld, beginScene, update, fixedUpdate, dispose). (packages/pix3-runtime/src/core/ECSService.ts)
- **InstancedMesh3D** — node-обёртка над `THREE.InstancedMesh` с bulk-API: `writeTransforms` / `writeMatrices` / `writeColors` и `flush()` для массовой выгрузки буферов на GPU. Набор persist-свойств узла: `maxInstances`, `instanceColor`, `castShadow`, `receiveShadow`, `frustumCulled`. (packages/pix3-runtime/src/nodes/3D/InstancedMesh3D.ts)
- **SceneRunner** — интегрирован с ECS (фикс-таймшаг + интерполяция). Перед каждым кадром происходит `flush()` всех `InstancedMesh3D`. Raycast теперь возвращает `instanceId` при попадании в инстансированный меш. (packages/pix3-runtime/src/core/SceneRunner.ts)
- **SceneService** — делегат расширен: `getECSService()` и `raycastViewport()` доступны потребителям.
- **SceneLoader / SceneSaver** — сериализация хранит только конфигурацию узла `InstancedMesh3D` (node-level config), буферы не сохраняются в сцене.
- **Экспорт** — новые модули экспортируются из точек входа runtime (`index.ts`).
- **Тесты** — добавлены unit-тесты для `ECSService`, `InstancedMesh3D` и сериализации/парсинга.

Совместимость и исправления
---------------------------
- `ResourceManager` — поправлен кейс создания `Blob` (создаётся копия через `Uint8Array`), чтобы избежать проблем с типизацией ArrayBuffer/SharedArrayBuffer.
- DeepCore (потребитель) — добавлена локальная декларация виртуального модуля `virtual:runtime-embedded-assets` для корректной типизации.

Пример использования
--------------------
```ts
// регистрация world
const ecs = sceneService.getECSService();
ecs.registerWorld(myWorld);

// системный / игровой шаг: запись матриц и flush
const inst = scene.findNodeById('instanced-1') as InstancedMesh3D;
// matricesFloat32Array: Float32Array из N*16 значений
inst.writeMatrices(0, matricesFloat32Array);
inst.flush();
```

Как проверить локально
----------------------
1. В пакете runtime:
```bash
cd packages/pix3-runtime
npm run build
yalc publish
```
2. В DeepCore (или другом потребителе):
```bash
yalc update @pix3/runtime
npm install
npm run dev
# открыть: http://localhost:8123 и запустить сцену (Play)
```

Ограничения и дальнейшие шаги
----------------------------
- UI/инспектор: пока не добавлена нативная поддержка создания и редактирования `InstancedMesh3D` в редакторе; требуется форма для node-level свойств и отображение `visibleInstanceCount`.
- Примеры/демо: добавить сцену/скрипт, демонстрирующий поток данных из ECS в `InstancedMesh3D`.
- Интеграционные тесты: покрыть end-to-end сценарий ECS → InstancedMesh3D при большом количестве инстансов.

Ключевые файлы (для быстрого обзора)
-----------------------------------
- packages/pix3-runtime/src/core/ECSService.ts
- packages/pix3-runtime/src/core/ecs.ts
- packages/pix3-runtime/src/nodes/3D/InstancedMesh3D.ts
- packages/pix3-runtime/src/core/SceneRunner.ts
- packages/pix3-runtime/src/core/SceneService.ts
- packages/pix3-runtime/src/core/SceneLoader.ts
- packages/pix3-runtime/src/core/SceneSaver.ts
- packages/pix3-runtime/src/index.ts

Если нужно, могу дополнить этот раздел примерами кода прямо в репозитории или добавить демо-сцену в DeepCore.

Дата: 2026-03-27
