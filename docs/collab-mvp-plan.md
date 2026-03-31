# Real-Time Collaboration MVP — Implementation Plan

> Hocuspocus + Yjs + SQLite поверх существующей архитектуры Pix3  
> Версия: 1.1 | Дата: 2026-03-31

### Changelog

| Версия | Дата | Изменения |
|---|---|---|
| 1.1 | 2026-03-31 | Asset Upload API (1.4), клиентский upload-flow (2.6), server-as-source-of-truth (3.7), offline persistence y-indexeddb (2.2) |
| 1.0 | 2026-03-31 | Первоначальный план |

---

## Обзор

Данный документ описывает пошаговый план реализации MVP совместного редактирования сцен в Pix3. Стратегия — добавить сетевой CRDT-слой (Yjs) **поверх** существующего `OperationService` без рефакторинга ядра, используя Hocuspocus как ретрансляционный WebSocket-сервер с персистенцией в SQLite.

**Архитектурная парадигма:** Cloud-Native. Сервер (SQLite + файловая система) является **единственным источником истины** для состояния сцены и бинарных ассетов. Клиент никогда не инициализирует серверный Y.Doc из своих локальных данных, кроме явной операции "Импорт локального проекта".

### Ключевые архитектурные ограничения Pix3

| Аспект | Текущее состояние | Влияние на коллаборацию |
|---|---|---|
| **Мутации** | Все через `CommandDispatcher → OperationService` | Единая точка перехвата для broadcast |
| **State** | Valtio `appState` (reactive proxy) | Нужен двунаправленный binding с `Y.Doc` |
| **SceneGraph** | In-memory `Map<string, NodeBase>`, не в reactive state | Требуется ручная синхронизация при remote-updates |
| **Undo/Redo** | `HistoryManager` с локальным стеком + closure-based undo/redo | Необходима замена на `Y.UndoManager` для per-client отмен |
| **Сериализация** | YAML через `SceneSaver`/`SceneLoader` | Используется для инициализации Y.Doc при первом подключении |
| **Events** | `OperationService` эмитит typed events (`operation:completed`, etc.) | Идеальный hook для отправки delta в Y.Doc |

---

## Фаза 1: Разработка ретрансляционного сервера (Backend)

**Цель:** автономный Node.js-микросервис для WebSocket-маршрутизации комнат и сохранения Yjs-документов в SQLite.

### 1.1 Инициализация проекта

**Задача:** создать пакет `packages/pix3-collab-server`.

```
packages/pix3-collab-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Hocuspocus + Express setup
│   ├── config.ts             # Environment config
│   ├── assets-handler.ts     # Static file serving (GET)
│   └── upload-handler.ts     # Asset upload API (POST)
├── data/                     # SQLite DB (gitignored)
├── projects/                 # Хранилище ассетов по проектам (gitignored)
└── .env.example
```

**Зависимости:**
```json
{
  "dependencies": {
    "@hocuspocus/server": "^2.x",
    "@hocuspocus/extension-sqlite": "^2.x",
    "yjs": "^13.x",
    "express": "^4.x",
    "multer": "^1.x",
    "cors": "^2.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "@types/express": "^4.x",
    "@types/multer": "^1.x"
  }
}
```

**Конфигурация `tsconfig.json`:**
- `target: "ES2022"`, `module: "NodeNext"` — совместимо с runtime-пакетом.
- Exclude client-side code.

### 1.2 Конфигурация Hocuspocus

**Файл:** `packages/pix3-collab-server/src/server.ts`

```typescript
import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import express from 'express';
import cors from 'cors';
import { config } from './config';

const hocuspocus = Server.configure({
  port: config.WS_PORT,           // default: 4000
  extensions: [
    new SQLite({
      database: config.SQLITE_PATH, // ./data/pix3-projects.sqlite
    }),
  ],

  // Хуки жизненного цикла
  async onConnect({ documentName, requestHeaders }) {
    // MVP: логирование подключений
    // Будущее: JWT-валидация из requestHeaders.Authorization
    console.log(`[collab] client connected to room: ${documentName}`);
  },

  async onDisconnect({ documentName }) {
    console.log(`[collab] client disconnected from room: ${documentName}`);
  },

  async onStoreDocument({ documentName, document }) {
    // SQLiteExtension handles persistence automatically.
    // Этот хук — для кастомной логики (бэкапы, метрики).
    console.log(`[collab] persisted snapshot for: ${documentName}`);
  },
});
```

**Маршрутизация комнат:**
- Hocuspocus использует `documentName` из WebSocket URL как идентификатор комнаты.
- Формат: `project:{projectId}:scene:{sceneId}`.
- Пример: `project:abc123:scene:main` — уникальная комната для конкретной сцены проекта.

### 1.3 Раздача статики (Assets)

**Файл:** `packages/pix3-collab-server/src/assets-handler.ts`

Express-middleware рядом с Hocuspocus для раздачи тяжёлых ресурсов (`.glb`, `.png`, `.jpg`).

```typescript
import express from 'express';
import path from 'path';
import { config } from './config';

export function mountAssetsHandler(app: express.Express) {
  // Раздаём из директории проектов
  app.use(
    '/assets',
    express.static(path.resolve(config.PROJECTS_DIR), {
      maxAge: '1h',
      immutable: false,
    })
  );
}
```

> **Соображение безопасности:** в MVP статика открыта. В production необходимо добавить авторизацию через middleware (проверка session token / project membership).

### 1.4 Asset Upload API (REST)

**Файл:** `packages/pix3-collab-server/src/upload-handler.ts`

**Проблема (v1.0):** план предусматривал только раздачу статики (GET), но не загрузку новых ассетов. Если Пользователь А добавит `.glb`-модель, `SceneCRDTBinding` отправит только метаданные ноды через Yjs. Пользователь Б получит структуру сцены, но сам файл не загрузится (404).

**Решение:** REST API для загрузки файлов через `multer`.

```typescript
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from './config';

// Хранение: projects/{projectId}/assets/{filename}
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = req.params.projectId;
    // Валидация projectId — только alphanumeric + dash
    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return cb(new Error('Invalid project ID'), '');
    }
    const dir = path.join(config.PROJECTS_DIR, projectId, 'assets');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Sanitize: удалить path traversal
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    // Добавить timestamp для уникальности (cache-busting)
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

// Ограничения: 100MB на файл, только разрешённые MIME-типы
const ALLOWED_MIME_TYPES = new Set([
  'model/gltf-binary',       // .glb
  'model/gltf+json',         // .gltf
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp3',
  'application/octet-stream', // fallback для .glb в некоторых браузерах
]);

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Disallowed MIME type: ${file.mimetype}`));
    }
  },
});

export function mountUploadHandler(app: express.Express) {
  // Upload одного или нескольких файлов
  app.post(
    '/api/projects/:projectId/assets',
    upload.array('files', 20), // максимум 20 файлов за раз
    (req, res) => {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
      const uploaded = files.map(f => ({
        originalName: f.originalname,
        storedName: f.filename,
        size: f.size,
        // URL для скачивания через assets-handler
        url: `/assets/${req.params.projectId}/assets/${f.filename}`,
      }));
      return res.status(201).json({ files: uploaded });
    }
  );

  // Error handler для multer
  app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message?.startsWith('Disallowed MIME type') || err.message === 'Invalid project ID') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });
}
```

**Ключевые аспекты безопасности:**
- **Path traversal**: `projectId` валидируется regex, `filename` санитизируется через `path.basename()`
- **MIME whitelist**: только разрешённые типы файлов
- **Size limit**: 100MB пер файл
- **Будущее (production)**: JWT-проверка прав на проект, rate limiting, virus scanning

**Интеграция в `server.ts`:**
```typescript
import { mountAssetsHandler } from './assets-handler';
import { mountUploadHandler } from './upload-handler';

const app = express();
app.use(cors());
mountAssetsHandler(app);   // GET /assets/:projectId/...
mountUploadHandler(app);   // POST /api/projects/:projectId/assets
app.listen(config.HTTP_PORT);
```

### 1.5 Конфигурация окружения

**Файл:** `packages/pix3-collab-server/src/config.ts`

```typescript
export const config = {
  WS_PORT: parseInt(process.env.WS_PORT || '4000'),
  HTTP_PORT: parseInt(process.env.HTTP_PORT || '4001'),
  SQLITE_PATH: process.env.SQLITE_PATH || './data/pix3-projects.sqlite',
  PROJECTS_DIR: process.env.PROJECTS_DIR || './projects',
};
```

### 1.6 Скрипты запуска

**В `packages/pix3-collab-server/package.json`:**
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### 1.7 Критерии приёмки фазы 1

- [ ] Сервер запускается командой `npm run dev` из `packages/pix3-collab-server`
- [ ] WebSocket-клиент может подключиться к `ws://localhost:4000`
- [ ] Yjs-документ сохраняется в SQLite при дебаунсе (2 секунды по умолчанию)
- [ ] Express раздаёт файлы из `./projects/` по HTTP
- [ ] `POST /api/projects/:projectId/assets` принимает файлы и возвращает URL
- [ ] Загруженные файлы доступны через `GET /assets/:projectId/...`
- [ ] Отклонение файлов с недопустимым MIME-типом (напр. `.exe`)
- [ ] Path traversal атака через `projectId` не проходит
- [ ] Smoke-тест: два клиента (`y-websocket` CLI) видят изменения друг друга

---

## Фаза 2: Интеграция сетевого слоя в клиент Pix3

**Цель:** добавить Yjs-провайдер в клиентскую часть без нарушения текущей логики.

### 2.1 Установка зависимостей

Добавить в корневой `package.json`:

```json
{
  "dependencies": {
    "yjs": "^13.x",
    "@hocuspocus/provider": "^2.x",
    "y-indexeddb": "^9.x"
  }
}
```

> `@hocuspocus/provider` предпочтительнее `y-websocket`, т.к. имеет встроенную поддержку reconnect, auth-token forwarding и awareness.
> `y-indexeddb` — клиентская персистенция Y.Doc для offline-редактирования.

### 2.2 Создание `CollaborationService`

**Файл:** `src/services/CollaborationService.ts`

Ответственность: управление жизненным циклом Yjs-подключения, awareness, статусом соединения.

```typescript
@injectable()
export class CollaborationService {
  private provider: HocuspocusProvider | null = null;
  private ydoc: Y.Doc | null = null;
  private undoManager: Y.UndoManager | null = null;
  private idbProvider: IndexeddbPersistence | null = null; // локальный offline-кэш

  // Статус для UI
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'synced' = 'disconnected';

  // Публичное API
  connect(projectId: string, sceneId: string, userName: string, userColor: string): void
  disconnect(): void
  getYDoc(): Y.Doc | null
  getAwareness(): Awareness | null
  getUndoManager(): Y.UndoManager | null
  getServerBaseUrl(): string  // HTTP base URL для asset upload/download
  isRemoteUpdate: boolean  // флаг для echo loop prevention

  dispose(): void
}
```

**Ключевые аспекты реализации:**

1. **Инициализация провайдера:**
```typescript
connect(projectId: string, sceneId: string, userName: string, userColor: string) {
  this.ydoc = new Y.Doc();
  const roomName = `project:${projectId}:scene:${sceneId}`;

  // 1. Локальная персистенция (offline support)
  this.idbProvider = new IndexeddbPersistence(roomName, this.ydoc);
  this.idbProvider.on('synced', () => {
    console.log('[collab] Y.Doc restored from IndexedDB');
  });

  // 2. Серверная синхронизация
  this.provider = new HocuspocusProvider({
    url: import.meta.env.VITE_COLLAB_WS_URL || 'ws://localhost:4000',
    name: roomName,
    document: this.ydoc,
    onStatus: ({ status }) => { this.connectionStatus = status; },
    onSynced: () => { this.connectionStatus = 'synced'; },
    onDisconnect: () => { this.connectionStatus = 'disconnected'; },
  });

  // Awareness (Presence)
  this.provider.awareness.setLocalStateField('user', {
    name: userName,
    color: userColor,
    selection: [],
    cursor: null,
  });
}
```

> **Порядок инициализации критичен:** сначала `IndexeddbPersistence` (мгновенно восстанавливает последнее состояние из браузера), затем `HocuspocusProvider` (синхронизирует с сервером). Yjs автоматически merge-ит оба источника через state vectors.

2. **Флаг `isRemoteUpdate`** — критически важен для предотвращения echo loop. Устанавливается в `true` при обработке входящих Yjs-событий, чтобы `OperationService` listener не отправлял delta обратно.

3. **`Y.UndoManager`** — создаётся для scope `Y.Map('scene')`, отслеживает только изменения локального `clientId`.

4. **`getServerBaseUrl()`** — возвращает HTTP base URL сервера (из `VITE_COLLAB_HTTP_URL`), используется `AssetUploadService` для загрузки файлов.

5. **`disconnect()`** — очищает все ресурсы: `provider.destroy()`, `idbProvider.destroy()`, `ydoc.destroy()`.

### 2.3 Регистрация в DI

**Файл:** `src/core/register-runtime-services.ts`  
Добавить регистрацию `CollaborationService` как singleton.

### 2.4 Переменные окружения

**Файл:** `.env` (gitignored) + `.env.example`

```env
VITE_COLLAB_WS_URL=ws://localhost:4000
VITE_COLLAB_HTTP_URL=http://localhost:4001
VITE_COLLAB_ENABLED=true
```

**Файл:** `vite.config.ts` — переменные с префиксом `VITE_` автоматически доступны через `import.meta.env`.

### 2.5 Критерии приёмки фазы 2

- [ ] `CollaborationService` зарегистрирован в DI-контейнере
- [ ] `connect()` устанавливает WebSocket-соединение с Hocuspocus
- [ ] Awareness-данные пользователя отправляются при подключении
- [ ] `connectionStatus` реактивно обновляется в `appState`
- [ ] `disconnect()` корректно очищает ресурсы (provider, idbProvider, ydoc, awareness)
- [ ] Y.Doc персистится в IndexedDB и восстанавливается при повторном открытии
- [ ] Переменные окружения `VITE_COLLAB_WS_URL` и `VITE_COLLAB_HTTP_URL` поддерживаются
- [ ] Загрузка ассетов через `AssetUploadService` работает

### 2.6 Клиентский поток загрузки ассетов (Asset Upload Flow)

**Проблема:** сейчас Pix3 работает с локальными файлами через `FileSystemAPIService`. Когда пользователь добавляет `.glb` модель, она читается с диска. В коллаборации другой пользователь не имеет доступа к этому диску — файл должен быть на сервере.

**Йфаал:** `src/services/AssetUploadService.ts`

```typescript
@injectable()
export class AssetUploadService {
  constructor(
    private collabService: CollaborationService,
  ) {}

  /**
   * Загружает файл на collab-сервер и возвращает серверный URL.
   * Вызывается ДО создания ноды в сцене.
   */
  async uploadAsset(projectId: string, file: File): Promise<AssetUploadResult> {
    const baseUrl = this.collabService.getServerBaseUrl();
    const formData = new FormData();
    formData.append('files', file);

    const response = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/assets`,
      { method: 'POST', body: formData }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    const uploaded = result.files[0];
    return {
      serverUrl: `${baseUrl}${uploaded.url}`,
      storedName: uploaded.storedName,
      originalName: uploaded.originalName,
    };
  }

  /**
   * Проверяет, доступен ли ассет на сервере (HEAD запрос).
   */
  async isAssetAvailable(url: string): Promise<boolean> {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      return resp.ok;
    } catch {
      return false;
    }
  }
}

interface AssetUploadResult {
  serverUrl: string;    // Полный URL для ResourceManager
  storedName: string;   // Имя файла на сервере
  originalName: string; // Оригинальное имя
}
```

**Интеграция в поток создания нод с ассетами:**

```
Пользователь drag-and-drop .glb во вьюпорт
  │
  ├─ [Оффлайн / локальный режим] → FileSystemAPIService (без изменений)
  │
  └─ [Коллаборация активна]
      │
      ├─ 1. AssetUploadService.uploadAsset(projectId, file)
      │      → POST /api/projects/:id/assets
      │      → Получить serverUrl
      │
      ├─ 2. Создать ноду с serverUrl вместо локального пути
      │      → CommandDispatcher.execute(CreateGLTF3DCommand, { source: serverUrl })
      │
      └─ 3. SceneCRDTBinding отправляет Y.Doc delta
             → Remote клиент получает ноду с serverUrl
             → ResourceManager загружает .glb по HTTP
```

**Модификация `ResourceManager`:**
- В collab-режиме `ResourceManager` должен резолвить URL ассетов относительно collab-сервера, а не локальной FS.
- **Стратегия резолюции:** если путь начинается с `http://` / `https://` — загрузка по HTTP; иначе — локальный `FileSystemAPIService`.

---

## Фаза 3: Синхронизация состояния (CRDT Binding)

**Цель:** двунаправленная синхронизация между локальным `SceneGraph` / `appState` и Yjs `Y.Doc`.

Это самая критичная и архитектурно сложная фаза.

### 3.1 Структура Y.Doc

**Маппинг `SceneGraph` → `Y.Doc`:**

```
Y.Doc
├── Y.Map('scene')                    ← корневой контейнер
│   ├── 'version': string
│   ├── 'description': string
│   ├── 'metadata': Y.Map
│   └── 'nodes': Y.Map               ← плоский реестр всех нод
│       ├── '{nodeId}': Y.Map         ← данные одной ноды
│       │   ├── 'type': string
│       │   ├── 'name': string
│       │   ├── 'parentId': string | null
│       │   ├── 'childOrder': Y.Array ← порядок дочерних нод (массив ID)
│       │   ├── 'groups': Y.Array
│       │   ├── 'properties': Y.Map   ← position, rotation, scale, opacity...
│       │   ├── 'metadata': Y.Map
│       │   └── 'components': Y.Array ← ScriptComponent definitions
│       └── ...
└── Y.Map('awareness')                ← управляется через Awareness API, НЕ здесь
```

**Обоснование плоской структуры:**
- Дерево нод хранится **плоско** (все ноды в одном `Y.Map('nodes')`) с полем `parentId` и `childOrder`, а не как вложенные `Y.Map`.
- **Причина:** вложенные структуры в Yjs генерируют сложные конфликты при одновременном reparenting. Плоская структура с `parentId` позволяет Yjs merge-ить изменения по полю, а дерево восстанавливается на клиенте.
- Это совпадает с паттерном `SceneGraph.nodeMap: Map<string, NodeBase>` — плоский lookup.

### 3.2 Модуль `SceneCRDTBinding`

**Файл:** `src/services/SceneCRDTBinding.ts`

Ответственность: трансляция изменений между `SceneGraph` + `appState` и `Y.Doc`.

```typescript
@injectable()
export class SceneCRDTBinding {
  // Прослушивает OperationService events → пишет delta в Y.Doc
  bindToOperationService(operationService: OperationService, collabService: CollaborationService): void

  // Прослушивает Y.Doc.observe() → обновляет SceneGraph + appState
  bindToYDoc(ydoc: Y.Doc, sceneManager: SceneManager): void

  // Начальная сериализация сцены в Y.Doc (для хоста)
  initializeYDocFromScene(ydoc: Y.Doc, sceneGraph: SceneGraph): void

  // Построение SceneGraph из Y.Doc (для гостей)
  buildSceneFromYDoc(ydoc: Y.Doc): SceneGraph

  dispose(): void
}
```

### 3.3 Направление: Local → Remote (Outbound)

**Поток данных:**

```
User Action
  → CommandDispatcher.execute()
  → OperationService.invokeAndPush()
  → OperationService emits 'operation:completed'
  → SceneCRDTBinding.onOperationCompleted()
    ├── if (collabService.isRemoteUpdate) → SKIP (echo prevention)
    └── else → compute delta → Y.Doc.transact(() => { apply changes })
```

**Определение delta:**

Вместо diff `beforeSnapshot` vs `afterSnapshot` (тяжело для complex state), используем **тегирование операций**:

| Операция | Y.Doc мутация |
|---|---|
| `UpdateObjectPropertyOperation` | `nodesMap.get(nodeId).get('properties').set(path, value)` |
| `CreateBoxOperation`, `CreateSprite2DOperation`, etc. | `nodesMap.set(nodeId, newNodeYMap)` + обновить `parentId`/`childOrder` |
| `DeleteObjectOperation` | `nodesMap.delete(nodeId)` + обновить `childOrder` родителя |
| `ReparentNodeOperation` | Обновить `parentId`, `childOrder` старого и нового родителя |
| `Transform2DCompleteOperation` | `nodesMap.get(nodeId).get('properties').set(...)` |

**Имплементация:** listener на `OperationService.addListener()`, dispatch по `metadata.id`:

```typescript
private onOperationCompleted(event: OperationEvent) {
  if (event.type !== 'operation:completed' || !event.didMutate) return;
  if (this.collabService.isRemoteUpdate) return; // echo guard

  const ydoc = this.collabService.getYDoc();
  if (!ydoc) return;

  ydoc.transact(() => {
    // Маршрутизация по metadata.id операции
    switch (event.metadata.id) {
      case 'update-object-property':
        this.syncPropertyToYDoc(event);
        break;
      case 'create-box':
      case 'create-sprite2d':
        this.syncNewNodeToYDoc(event);
        break;
      case 'delete-object':
        this.syncDeleteToYDoc(event);
        break;
      case 'reparent-node':
        this.syncReparentToYDoc(event);
        break;
      // ... остальные операции
    }
  }, this.localOrigin); // origin для фильтрации
}
```

### 3.4 Направление: Remote → Local (Inbound)

**Поток данных:**

```
Hocuspocus broadcast
  → HocuspocusProvider receives Y.Doc update
  → Y.Map('nodes').observe(event)
  → SceneCRDTBinding.onRemoteChange()
    ├── collabService.isRemoteUpdate = true   ← GUARD ON
    ├── Apply to SceneGraph (add/remove/update nodes)
    ├── Update appState (hierarchies, nodeDataChangeSignal)
    ├── collabService.isRemoteUpdate = false  ← GUARD OFF
    └── Trigger UI re-render
```

**Обработка типов изменений в `Y.Map.observe()`:**

```typescript
private onNodesMapChange(event: Y.YMapEvent<Y.Map<any>>) {
  // Фильтрация: только remote-изменения
  if (event.transaction.origin === this.localOrigin) return;

  this.collabService.isRemoteUpdate = true;
  try {
    event.changes.keys.forEach((change, nodeId) => {
      switch (change.action) {
        case 'add':
          this.createNodeFromRemote(nodeId);
          break;
        case 'update':
          this.updateNodeFromRemote(nodeId);
          break;
        case 'delete':
          this.deleteNodeFromRemote(nodeId);
          break;
      }
    });
    // Обновить appState.scenes.hierarchies для текущей сцены
    SceneStateUpdater.updateHierarchyState(appState, sceneId, sceneGraph);
    appState.scenes.nodeDataChangeSignal++;
  } finally {
    this.collabService.isRemoteUpdate = false;
  }
}
```

**Создание ноды из remote-данных:**
- Извлечь `type`, `name`, `properties`, `parentId` из `Y.Map`
- Через `SceneLoader` / `NodeRegistry` создать экземпляр `NodeBase` нужного типа
- Добавить в `SceneGraph.nodeMap` и в `parent.adoptChild()`
- **Не** создавать `HistoryEntry` — это чужое действие

### 3.5 Echo Loop Prevention — детальная схема

```
┌─────────────────────────────────────────────────────┐
│                    Echo Prevention                    │
│                                                       │
│  Local user action                                    │
│    ↓                                                  │
│  OperationService.invoke()                            │
│    ↓                                                  │
│  [isRemoteUpdate === false] → write to Y.Doc          │
│    ↓                                                  │
│  Y.Doc.transact(fn, localOrigin)                      │
│    ↓                                                  │
│  Y.Map.observe fires                                  │
│    ↓                                                  │
│  [event.transaction.origin === localOrigin] → SKIP    │
│                                                       │
│  ──────────────────────────────────────────────────── │
│                                                       │
│  Remote Y.Doc update arrives                          │
│    ↓                                                  │
│  Y.Map.observe fires                                  │
│    ↓                                                  │
│  [origin !== localOrigin] → apply to SceneGraph       │
│    ↓                                                  │
│  isRemoteUpdate = true                                │
│    ↓                                                  │
│  Update appState (triggers Valtio subscribers)        │
│    ↓                                                  │
│  OperationService listener checks isRemoteUpdate      │
│    ↓                                                  │
│  [isRemoteUpdate === true] → SKIP writing to Y.Doc    │
│    ↓                                                  │
│  isRemoteUpdate = false                               │
└─────────────────────────────────────────────────────┘
```

### 3.6 Интеграция Undo/Redo с `Y.UndoManager`

**Проблема:** текущий `HistoryManager` использует closure-based undo/redo. В мультиплеере один пользователь может случайно отменить действие другого.

**Решение:**

1. **Режим коллаборации:** при подключении к комнате, `OperationService` переключается на `Y.UndoManager`:
   ```typescript
   const undoManager = new Y.UndoManager(
     [sceneMap], // scope
     {
       trackedOrigins: new Set([localOrigin]), // только свои изменения
       captureTimeout: 500, // группировка быстрых изменений
     }
   );
   ```

2. **Адаптация `OperationService.undo()` / `redo()`:**
   ```typescript
   async undo(): Promise<boolean> {
     const collabService = container.getService(CollaborationService);
     if (collabService?.isConnected()) {
       const um = collabService.getUndoManager();
       if (um && um.undoStack.length > 0) {
         um.undo(); // Y.UndoManager undo — только свои изменения
         return true;
       }
       return false;
     }
     // Fallback к локальному HistoryManager
     return this.historyManager.undo();
   }
   ```

3. **`trackedOrigins`** содержит `localOrigin`, поэтому `Y.UndoManager` не будет группировать remote-изменения в стек отмены.

### 3.7 Инициализация сцены при подключении (Server-as-Source-of-Truth)

> **Архитектурное изменение (v1.1):** В v1.0 клиент мог инициализировать Y.Doc из своей локальной сцены. Это P2P-подход, уязвимый в облачной модели: если первый подключившийся клиент не имеет актуальной сцены (или вообще не имеет файлов), он затрёт серверные данные пустым состоянием.
>
> **Новая парадигма:** сервер (SQLite через `@hocuspocus/extension-sqlite`) является **единственным источником истины**. Клиент **никогда** не пушит свою локальную сцену в Y.Doc при подключении. Инициализация Y.Doc из локальных данных допускается **только** через явную команду "Импорт локального проекта".

**Сценарий A: Подключение к существующему проекту (основной кейс)**

Клиент переходит по ссылке или выбирает проект из списка. У него может не быть локальных файлов.

```typescript
provider.on('synced', () => {
  const sceneMap = ydoc.getMap('scene');
  const nodesMap = sceneMap.get('nodes') as Y.Map<Y.Map<unknown>> | undefined;

  if (nodesMap && nodesMap.size > 0) {
    // Y.Doc содержит данные (из SQLite или от другого клиента)
    // → Строим SceneGraph из серверного состояния
    const graph = this.buildSceneFromYDoc(ydoc);
    sceneManager.setActiveSceneGraph(sceneId, graph);
    SceneStateUpdater.updateHierarchyState(appState, sceneId, graph);
  } else {
    // Y.Doc абсолютно пуст → новый проект
    // → Создаём пустую сцену (дефолтные ноды: Camera, Light)
    ydoc.transact(() => {
      this.initializeEmptyScene(ydoc);
    }, localOrigin);
  }
});
```

**Сценарий B: Импорт локального проекта в облако (явная команда)**

Пользователь выбирает "Publish to Cloud" / "Import Local Project". Это **явное действие**, не автоматическое.

```typescript
// src/features/project/ImportLocalProjectCommand.ts
async execute(context: CommandContext) {
  const collabService = context.container.getService(CollaborationService);
  const sceneManager = context.container.getService(SceneManager);

  // 1. Загрузить ассеты на сервер
  const assetUpload = context.container.getService(AssetUploadService);
  const assets = await this.collectLocalAssets();
  for (const asset of assets) {
    await assetUpload.uploadAsset(projectId, asset);
  }

  // 2. Сериализовать текущую сцену в Y.Doc
  const ydoc = collabService.getYDoc();
  const sceneGraph = sceneManager.getActiveSceneGraph();
  if (ydoc && sceneGraph) {
    ydoc.transact(() => {
      binding.initializeYDocFromScene(ydoc, sceneGraph);
    }, localOrigin);
  }
}
```

**Сценарий C: Восстановление после перезагрузки сервера**

>  `SQLiteExtension` автоматически загружает Y.Doc из базы при первом подключении к комнате. Клиенту не нужна специальная логика — Hocuspocus отправляет сохранённый state vector при `synced`.

**Сценарий D: Offline → Reconnect (с y-indexeddb)**

```
1. Клиент отключился от сервера
2. Продолжил работать → изменения в Y.Doc → автоматически в IndexedDB
3. Клиент переподключается
4. HocuspocusProvider автоматически отправляет pending updates
5. Yjs merge через state vectors → конфликты разрешены CRDT
6. SQLite обновляется через debounce
```

> **Гарантия:** `y-indexeddb` НЕ может затереть серверный стейт — Yjs merge аддитивен (state vectors + CRDT). Конфликтующие concurrent-изменения разрешаются по CRDT-правилам (last writer wins для `Y.Map`, ordered merge для `Y.Array`).

### 3.8 Критерии приёмки фазы 3

- [ ] Local property change (e.g., opacity) появляется у remote клиента
- [ ] Remote property change обновляет SceneGraph и Inspector UI
- [ ] Создание ноды одним клиентом отображается в Scene Tree другого
- [ ] Удаление ноды — аналогично
- [ ] Reparenting ноды — порядок детей корректен у обоих клиентов
- [ ] Echo loop отсутствует (mutation один раз, без зацикливания)
- [ ] Undo одного клиента не отменяет действие другого
- [ ] Подключение к существующей комнате: клиент получает сцену от сервера (не инициализирует свою)
- [ ] Подключение к пустой комнате: создаётся пустая дефолтная сцена
- [ ] "Import Local Project": локальная сцена + ассеты загружаются на сервер
- [ ] Перезагрузка сервера: Y.Doc восстанавливается из SQLite, клиенты не теряют данные
- [ ] Offline → reconnect: pending изменения корректно merge-ятся через state vectors

---

## Фаза 4: Эфемерные данные и Presence (UX Figma)

**Цель:** визуальные индикаторы совместной работы через Awareness API.

### 4.1 Структура Presence-данных

```typescript
interface CollabUserPresence {
  name: string;
  color: string;              // Уникальный цвет пользователя
  selection: string[];         // Массив nodeId выделенных нод
  cursor3d: {                  // 3D-позиция курсора (raycast intersection)
    x: number;
    y: number;
    z: number;
  } | null;
  cameraPosition: {           // Позиция камеры для "follow" mode
    x: number; y: number; z: number;
  } | null;
  isTransforming: string | null; // nodeId ноды, которую пользователь сейчас трансформирует (soft-lock)
}
```

**Обновление Awareness:**
- **Selection:** при изменении `appState.selection.nodeIds` → `awareness.setLocalStateField('user', { ...current, selection: [...nodeIds] })`.
- **Cursor3d:** при `pointermove` в viewport → raycast → отправка `cursor3d` с дебаунсом (30ms).
- **isTransforming:** при начале drag gizmo → установить nodeId; при завершении → `null`.

### 4.2 Индикация в Scene Tree

**Файл:** `src/ui/scene-tree/scene-tree-node.ts`

```
Изменения:
1. Подписка на Awareness changes через CollaborationService
2. Для каждого nodeId — проверка: есть ли в awareness других
   пользователей этот nodeId в массиве selection
3. Если да — добавить CSS-класс с border-left цвета пользователя
```

**CSS (Light DOM):**
```css
/* В scene-tree-node.ts.css */
.scene-tree-node[data-collab-selected] {
  border-left: 3px solid var(--collab-user-color, #ffcf33);
}
.scene-tree-node .collab-user-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 4px;
}
```

### 4.3 Визуализация во Viewport (Three.js)

**Файл:** `src/services/CollabViewportOverlayService.ts`

Ответственность: рендеринг presence-данных поверх 3D-сцены.

**Реализация:**

1. **Курсоры других пользователей:**
   - Для каждого remote-пользователя с `cursor3d !== null` — создать Three.js `Sprite` с текстурой-билбордом (имя + цветная точка).
   - Обновлять позицию в render loop из Awareness state.
   - Удалять при `cursor3d === null` или при отключении пользователя.

2. **Выделение объектов другими пользователями:**
   - Добавить `OutlinePass` (из `three/examples/jsm/postprocessing/OutlinePass`) с уникальным цветом пользователя.
   - Подписка на Awareness → при изменении `selection` remote-пользователя → обновить массив `selectedObjects` в `OutlinePass`.
   - Альтернатива: использовать `EdgesGeometry` + `LineBasicMaterial` с цветом пользователя (проще, без постпроцессинга).

3. **Soft-locks (опционально для MVP):**
   - Если remote-пользователь установил `isTransforming: nodeId` — скрыть gizmo для этого объекта у локального пользователя.
   - Визуальная индикация: полупрозрачная рамка вокруг locked-объекта с именем пользователя.

### 4.4 Компонент статуса подключения

**Файл:** `src/ui/collab/collab-status-bar.ts`

Минимальный Lit-компонент в статус-баре:

```
[●] Connected — 3 users online    |   [○] Offline — changes saved locally
```

**Поведение:**
- Подписка на `CollaborationService.connectionStatus`
- Индикатор: зелёный (synced), жёлтый (connecting), красный (disconnected)
- Клик → dropdown со списком подключённых пользователей (Awareness)

### 4.5 Критерии приёмки фазы 4

- [ ] В Scene Tree видны цветные индикаторы выделения других пользователей
- [ ] Во Viewport видны 3D-курсоры (билборды) с именами
- [ ] Viewport показывает outline выделенных другими объектов
- [ ] Статус-бар отображает текущее состояние подключения
- [ ] Список пользователей отображается при клике на статус
- [ ] Soft-lock: нельзя двигать объект, который трансформирует другой пользователь

---

## Фаза 5: Тестирование и стабилизация

### 5.1 Скрипты запуска

**Корневой `package.json`:**

```json
{
  "scripts": {
    "dev:collab": "concurrently \"npm run dev -w packages/pix3-collab-server\" \"npm run dev\"",
    "dev:collab:server": "npm run dev -w packages/pix3-collab-server"
  }
}
```

> Зависимость `concurrently` — для параллельного запуска сервера и клиента.

### 5.2 Обработка отключений

| Событие | Действие |
|---|---|
| WebSocket disconnect | Показать "Offline" в статус-баре. Локальные правки продолжают работать. |
| WebSocket reconnect | Yjs автоматически sync-ает pending updates. Показать "Synced". |
| Сервер недоступен при старте | Показать уведомление через `DialogService`. Редактор работает в offline-режиме. |
| `CollaborationService.connect()` fail | Fallback к стандартному HistoryManager. Повторить через 5 секунд (exponential backoff). |

### 5.3 Инициализация и источник истины

**Парадигма:** Server-as-Source-of-Truth (см. Фаза 3.7).

| Сценарий | Поведение |
|---|---|
| Подключение к существующему проекту | Клиент получает Y.Doc от сервера (SQLite), строит SceneGraph |
| Пустая комната | Создаётся дефолтная сцена (Camera + Light) |
| Перезагрузка сервера | SQLiteExtension восстанавливает Y.Doc автоматически |
| Импорт локального проекта | Явная команда: upload ассетов + инициализация Y.Doc |
| Offline → reconnect | IndexedDB сохраняет pending changes, Yjs merge при reconnect |

> Клиент **никогда не пытается** парсить свои локальные `.pix3scene` файлы и пушить их в Y.Doc при обычном подключении.

### 5.4 Тест-кейсы

**Unit-тесты (Vitest):**

| Тест | Что проверяет |
|---|---|
| `SceneCRDTBinding.initializeYDocFromScene` | Корректность маппинга SceneGraph → Y.Doc |
| `SceneCRDTBinding.buildSceneFromYDoc` | Корректность восстановления SceneGraph из Y.Doc |
| `Echo loop prevention` | Мутация не зацикливается |
| `Y.UndoManager integration` | Undo отменяет только локальные действия |
| `Concurrent property update` | Два клиента меняют разные свойства одной ноды |
| `Concurrent reparent` | Два клиента reparent разные ноды |
| `Node creation + deletion race` | Один создаёт, другой удаляет |
| `Asset upload integration` | Файл загружен на сервер до создания ноды |
| `Server-first initialization` | Клиент не пушит локальную сцену при подключении |
| `Offline persistence (IndexedDB)` | Y.Doc восстанавливается после перезагрузки вкладки |

**E2E-тесты (manual для MVP):**

1. Открыть два браузера → подключиться к одной комнате
2. В одном — создать Box → во втором должен появиться в Scene Tree
3. Drag-move объекта → transform обновляется у второго
4. Undo у первого → объект исчезает у обоих
5. Закрыть один браузер → открыть заново → сцена восстановлена из SQLite
6. Drag-and-drop `.glb` во вьюпорт → модель появляется у второго клиента (загружена с сервера)
7. Отключить WiFi → сделать изменения → включить WiFi → изменения синхронизированы
8. Открыть новый браузер по ссылке (без локальных файлов) → сцена загружена с сервера

### 5.5 Критерии приёмки фазы 5

- [ ] `npm run dev:collab` запускает оба сервера параллельно
- [ ] Two-tab test: создание/удаление/перемещение нод синхронизируется
- [ ] Asset drag-and-drop: модель загружается на сервер, доступна другому клиенту
- [ ] Offline → reconnect: pending изменения восстанавливаются (через IndexedDB + state vectors)
- [ ] Fresh browser (без локальных файлов) получает сцену с сервера
- [ ] Уведомления о статусе подключения отображаются в UI
- [ ] Unit-тесты SceneCRDTBinding проходят
- [ ] Нет memory leaks при повторных connect/disconnect циклах

---

## Карта новых файлов

```
packages/pix3-collab-server/           ← НОВЫЙ ПАКЕТ
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── config.ts
│   ├── assets-handler.ts          ← GET: раздача статики
│   └── upload-handler.ts          ← POST: загрузка ассетов (multer)
├── data/                              ← gitignored (SQLite)
└── projects/                          ← gitignored (ассеты проектов)

src/services/
├── CollaborationService.ts            ← НОВЫЙ
├── SceneCRDTBinding.ts                ← НОВЫЙ
├── AssetUploadService.ts              ← НОВЫЙ
└── CollabViewportOverlayService.ts    ← НОВЫЙ

src/features/project/
└── ImportLocalProjectCommand.ts       ← НОВЫЙ

src/ui/collab/                         ← НОВАЯ ДИРЕКТОРИЯ
├── collab-status-bar.ts
└── collab-status-bar.ts.css

src/state/AppState.ts                  ← МОДИФИЦИРОВАН (collaboration slice)
src/services/OperationService.ts       ← МОДИФИЦИРОВАН (Y.UndoManager routing)
src/core/register-runtime-services.ts  ← МОДИФИЦИРОВАН (CollaborationService, AssetUploadService)
src/ui/scene-tree/scene-tree-node.ts   ← МОДИФИЦИРОВАН (presence indicators)
packages/pix3-runtime/src/core/ResourceManager.ts  ← МОДИФИЦИРОВАН (HTTP URL resolution)
vite.config.ts                         ← МОДИФИЦИРОВАН (proxy для WS)
package.json                           ← МОДИФИЦИРОВАН (dependencies, scripts)
.env.example                           ← НОВЫЙ
```

---

## Риски и mitigation

| Риск | Вероятность | Mitigation |
|---|---|---|
| **Y.Doc ↔ SceneGraph рассинхронизация** | Высокая | Periodical checksum validation + force-resync кнопка |
| **Three.js объекты не созданы при remote add** | Средняя | Создание через `NodeRegistry` + `SceneLoader` паттерн  |
| **Performance при >10 пользователей** | Средняя | Awareness throttling (100ms), prop update debounce |
| **Large scene initial sync** | Средняя | Lazy sync: передавать только видимые ноды, остальные — по запросу |
| **Ассет недоступен (404) при remote add** | Высокая | Upload-before-create паттерн (AssetUploadService) |
| **Клиент затирает серверный стейт** | Высокая | Server-as-Source-of-Truth парадигма (см. 3.7) |
| **Конфликт при одновременном reparent** | Средняя | Yjs `Y.Map` merge по `parentId` — last-write-wins; уведомление пользователю |
| **IndexedDB quota exceeded** | Низкая | Очистка старых проектов, уведомление пользователю |

---

## Порядок реализации и зависимости

```
Фаза 1 (Backend)          ← независима, можно начать сразу
    │
    ▼
Фаза 2 (Network Layer)    ← зависит от Фазы 1 (нужен сервер для тестов)
    │
    ▼
Фаза 3 (CRDT Binding)     ← зависит от Фазы 2 (нужен CollaborationService)
    │
    ├── 3.1-3.4 могут разрабатываться последовательно
    │   (каждый шаг тестируется изолированно с mock Y.Doc)
    │
    └── 3.6 (Undo/Redo) может разрабатываться параллельно с 3.3-3.4
    │
    ▼
Фаза 4 (Presence UI)      ← зависит от Фазы 2 (Awareness), частично от Фазы 3
    │
    ├── 4.1-4.2 (Scene Tree) — после Фазы 2
    ├── 4.3 (Viewport)       — после Фазы 3 (нужен рабочий sync)
    └── 4.4 (Status Bar)     — после Фазы 2
    │
    ▼
Фаза 5 (Testing)          ← после всех фаз, интеграционное тестирование
```

---

## Оценка объёма (T-shirt sizing)

| Фаза | Оценка | Основная сложность |
|---|---|---|
| Фаза 1 — Backend | **M** | Hocuspocus + Express + Asset Upload API + безопасность |
| Фаза 2 — Network Layer | **M** | DI-интеграция, lifecycle, AssetUploadService, IndexedDB persistence |
| Фаза 3 — CRDT Binding | **XL** | Двунаправленная синхронизация, echo prevention, undo, server-first init |
| Фаза 4 — Presence UI | **M** | Three.js overlay, Lit reactivity |
| Фаза 5 — Testing | **M** | Edge-cases, race conditions, offline scenarios |

## Примечания

Несколько технических замечаний, которые стоит держать в фокусе при переходе от проектирования к написанию кода:

Жизненный цикл ассетов (Орфанные файлы): В текущем MVP реализована только загрузка (Upload). Если пользователь перетащит в сцену модель на 50 МБ, а затем удалит ноду или нажмет Undo, бинарный файл останется в файловой системе сервера. Для MVP это приемлемое ограничение, но в архитектурный бэклог следует заложить создание Garbage Collector — фонового процесса, который раз в сутки сверяет файлы директории assets с графом нод в актуальном Y.Doc и удаляет неиспользуемые.

Эргономика интерфейса при загрузке (UX): AssetUploadService выполняет сетевые HTTP-запросы. Передача тяжелых файлов занимает время. Во избежание ощущения "зависшего" редактора при drag-and-drop, интерфейс вьюпорта должен отображать временный плейсхолдер (например, wireframe-куб) и индикатор прогресса (Progress Overlay) до завершения POST-запроса и последующей генерации Create*Command.

Лимиты локального хранилища: Использование y-indexeddb делает систему устойчивой к разрывам сети. Однако в браузерах действуют динамические квоты на размер IndexedDB. При работе с тяжелыми проектами агент должен предусмотреть обработку QuotaExceededError в CollaborationService, чтобы сбой локальной персистенции не приводил к крашу всего движка Pix3 (fallback в in-memory режим).

Оптимизация ResourceManager: При загрузке ассетов по http:// URL, движку стоит полагаться не только на заголовки maxAge от Express, но и максимально задействовать Service Worker (src/sw.ts). Кэширование Cache-First для отдачи .glb файлов из CacheStorage браузера кардинально ускорит загрузку сцен для гостей при повторных подключениях к комнате.