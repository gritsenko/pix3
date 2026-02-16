import type { CommandContext, CommandPreconditionResult } from '@/core/command';
import { SceneManager } from '@pix3/runtime';

export const requireActiveScene = (
  context: CommandContext,
  reason: string
): CommandPreconditionResult => {
  const sceneManager = context.container.getService<SceneManager>(
    context.container.getOrCreateToken(SceneManager)
  );

  if (!sceneManager.getActiveSceneGraph()) {
    return {
      canExecute: false,
      reason,
      scope: 'scene',
    };
  }

  return { canExecute: true };
};

export const getCreatedNodeIdFromSelection = (
  context: CommandContext,
  didMutate: boolean
): string => {
  if (!didMutate) {
    return '';
  }

  return context.state.selection.primaryNodeId ?? '';
};
