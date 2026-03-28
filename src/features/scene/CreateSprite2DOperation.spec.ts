import { describe, expect, it } from 'vitest';
import type { OperationContext } from '@/core/Operation';
import { createInitialAppState } from '@/state/AppState';
import { SceneManager, Group2D, AssetLoader, type NodeBase } from '@pix3/runtime';
import { Texture, Vector2 } from 'three';
import { CreateSprite2DOperation } from './CreateSprite2DOperation';

describe('CreateSprite2DOperation', () => {
  it('adds sprite to root nodes when created via async flow', async () => {
    const state = createInitialAppState();
    state.scenes.activeSceneId = 'scene-1';
    state.scenes.descriptors['scene-1'] = {
      id: 'scene-1',
      filePath: 'res://scene.pix3scene',
      name: 'Scene',
      version: '1.0.0',
      isDirty: false,
      lastSavedAt: null,
      fileHandle: null,
      lastModifiedTime: null,
    };

    const parentA = new Group2D({
      id: 'group-a',
      name: 'Group A',
      position: new Vector2(0, 0),
      width: 100,
      height: 100,
    });
    const parentB = new Group2D({
      id: 'group-b',
      name: 'Group B',
      position: new Vector2(0, 0),
      width: 100,
      height: 100,
    });

    const rootNodes: NodeBase[] = [parentA, parentB];
    const nodeMap = new Map<string, NodeBase>([
      [parentA.nodeId, parentA],
      [parentB.nodeId, parentB],
    ]);
    const sceneGraph = {
      version: '1.0.0',
      description: 'Scene',
      metadata: {},
      rootNodes,
      nodeMap,
    };

    const sceneManagerMock = {
      getSceneGraph: (sceneId: string) => (sceneId === 'scene-1' ? sceneGraph : null),
    } satisfies Pick<SceneManager, 'getSceneGraph'>;

    let resolveTexture!: () => void;
    const textureLoaded = new Promise<void>(resolve => {
      resolveTexture = resolve;
    });
    const assetLoaderMock = {
      loadTexture: async () => {
        await textureLoaded;
        const texture = new Texture();
        (texture as Texture & { image: { naturalWidth: number; naturalHeight: number } }).image = {
          naturalWidth: 64,
          naturalHeight: 32,
        };
        return texture;
      },
    } satisfies Pick<AssetLoader, 'loadTexture'>;

    const container = {
      getOrCreateToken: <T>(token: T): T => token,
      getService: <T>(token: unknown): T => {
        if (token === SceneManager) {
          return sceneManagerMock as T;
        }
        if (token === AssetLoader) {
          return assetLoaderMock as T;
        }
        throw new Error(`Unexpected token: ${String(token)}`);
      },
    };

    state.selection.primaryNodeId = parentB.nodeId;

    const context = {
      state,
      snapshot: {
        selection: {
          primaryNodeId: parentA.nodeId,
        },
      },
      container: container as OperationContext['container'],
      requestedAt: Date.now(),
    } as unknown as OperationContext;

    const operation = new CreateSprite2DOperation({
      texturePath: 'res://assets/sprite.png',
    });

    const performPromise = operation.perform(context);

    state.selection.primaryNodeId = parentB.nodeId;
    resolveTexture();

    const result = await performPromise;
    expect(result.didMutate).toBe(true);
    expect(sceneGraph.rootNodes).toHaveLength(3);
    expect(parentA.children).toHaveLength(0);
  });
});
