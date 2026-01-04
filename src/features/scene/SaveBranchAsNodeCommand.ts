import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { SceneManager } from '@/core/SceneManager';
import { SceneSaver } from '@/core/SceneSaver';
import { FileSystemAPIService } from '@/services/FileSystemAPIService';
import type { NodeBase } from '@/nodes/NodeBase';

export interface SaveBranchAsNodeParams {
  /** ID of the node to save as a prefab */
  nodeId: string;
  /** Destination path for the .pix3node file (relative to project root, with res:// prefix) */
  destinationPath: string;
  /** Whether to replace the original node with an instance reference after saving */
  replaceWithInstance?: boolean;
}

export interface SaveBranchAsNodePayload {
  savedPath: string;
  nodeId: string;
}

/**
 * SaveBranchAsNodeCommand
 * 
 * Saves a node subtree as a reusable prefab (.pix3node file).
 * Optionally replaces the original node with an instance reference to the new prefab.
 */
export class SaveBranchAsNodeCommand extends CommandBase<SaveBranchAsNodePayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.save-branch-as-node',
    title: 'Save Branch as Prefab',
    description: 'Export a node subtree as a reusable .pix3node prefab file',
    keywords: ['save', 'export', 'prefab', 'node', 'branch', 'instance'],
  };

  private readonly params: SaveBranchAsNodeParams;

  constructor(params: SaveBranchAsNodeParams) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );
    const activeScene = sceneManager.getActiveSceneGraph();
    
    if (!activeScene) {
      return {
        canExecute: false,
        reason: 'No active scene',
        scope: 'scene' as const,
      };
    }

    const targetNode = activeScene.nodeMap.get(this.params.nodeId);
    if (!targetNode) {
      return {
        canExecute: false,
        reason: `Node with ID "${this.params.nodeId}" not found`,
        scope: 'scene' as const,
      };
    }

    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<SaveBranchAsNodePayload>> {
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );
    const sceneSaver = context.container.getService<SceneSaver>(
      context.container.getOrCreateToken(SceneSaver)
    );
    const fileSystemService = context.container.getService<FileSystemAPIService>(
      context.container.getOrCreateToken(FileSystemAPIService)
    );

    const activeScene = sceneManager.getActiveSceneGraph();
    if (!activeScene) {
      throw new Error('No active scene');
    }

    const targetNode = activeScene.nodeMap.get(this.params.nodeId);
    if (!targetNode) {
      throw new Error(`Node with ID "${this.params.nodeId}" not found`);
    }

    // Create a temporary scene graph with just this node as the root
    const prefabGraph = {
      version: '1.0.0',
      description: `Prefab: ${targetNode.name}`,
      metadata: {},
      rootNode: targetNode,
      nodeMap: new Map<string, NodeBase>(),
    };

    // Serialize the node subtree
    const yaml = sceneSaver.serializeScene(prefabGraph);

    // Clean the destination path (remove res:// prefix)
    const cleanPath = this.params.destinationPath.replace(/^res:\/\//i, '');

    // Write the file
    await fileSystemService.writeTextFile(cleanPath, yaml);

    console.log('[SaveBranchAsNodeCommand] Saved prefab to', cleanPath);

    // TODO: If replaceWithInstance is true, replace the original node with an instance
    // This would require a new operation to handle the replacement

    return {
      didMutate: true,
      payload: {
        savedPath: this.params.destinationPath,
        nodeId: this.params.nodeId,
      },
    };
  }
}
