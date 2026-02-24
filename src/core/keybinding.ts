/**
 * Keybinding system for cross-platform keyboard shortcuts.
 * 
 * Supports abstract keybinding descriptors (e.g., 'Mod+D', 'Mod+Shift+Z')
 * where 'Mod' expands to Cmd on macOS and Ctrl on Windows/Linux.
 * 
 * Keybindings can have context clauses ('when') for conditional execution.
 */

import type { Platform } from '@/fw/platform';
import { getCurrentPlatform } from '@/fw/platform';
import type { EditorContextState } from '@/state/AppState';

/**
 * Abstract keybinding descriptor string.
 * 
 * Format: `Modifier+Modifier+Key` or multiple alternatives separated by `|`
 * 
 * Examples:
 * - `'Mod+D'` - Cmd+D on Mac, Ctrl+D elsewhere
 * - `'Mod+Shift+Z | Ctrl+Y'` - Two alternative keybindings for redo
 * - `'Delete | Backspace'` - Either Delete or Backspace
 * - `'Alt+Shift+F'` - Alt+Shift+F on all platforms
 * 
 * Modifiers: `Mod`, `Ctrl`, `Shift`, `Alt`, `Cmd` (Mac-specific)
 * Keys: Character keys (A-Z, 0-9) or special keys (Enter, Escape, Delete, etc.)
 */
export type KeybindingDescriptor = string;

/**
 * Context clause for conditional keybinding execution (VS Code-style "when" clause).
 * 
 * Format: Simple boolean expressions with context keys.
 * 
 * Examples:
 * - `'viewportFocused'`
 * - `'!isInputFocused'`
 * - `'viewportFocused && !isModalOpen'`
 * - `'(viewportFocused || sceneTreeFocused) && !isInputFocused'`
 * 
 * Supported context keys:
 * - `viewportFocused` - Viewport panel has focus
 * - `sceneTreeFocused` - Scene tree panel has focus
 * - `inspectorFocused` - Inspector panel has focus
 * - `assetsFocused` - Assets browser has focus
 * - `isInputFocused` - An input element has focus
 * - `isModalOpen` - A modal dialog is open
 */
export type KeybindingContext = string;

/**
 * Parsed keybinding with normalized modifiers and key code.
 */
export interface Keybinding {
  /** Physical key code (e.g., 'KeyD', 'Digit1') or key name (e.g., 'Enter', 'Delete'). */
  key: string;
  /** Fallback to event.key for special keys that don't have consistent codes. */
  keyFallback?: string;
  /** Ctrl modifier required. */
  ctrl?: boolean;
  /** Shift modifier required. */
  shift?: boolean;
  /** Alt modifier required. */
  alt?: boolean;
  /** Meta/Cmd modifier required (Mac Command key). */
  meta?: boolean;
  /** Context clause for conditional execution. */
  when?: KeybindingContext;
  /** Prevent command execution on key repeat (default: true). */
  preventRepeat?: boolean;
}

/**
 * Map of character keys to physical key codes.
 */
const KEY_CODE_MAP: Record<string, string> = {
  // Letters
  a: 'KeyA', b: 'KeyB', c: 'KeyC', d: 'KeyD', e: 'KeyE', f: 'KeyF',
  g: 'KeyG', h: 'KeyH', i: 'KeyI', j: 'KeyJ', k: 'KeyK', l: 'KeyL',
  m: 'KeyM', n: 'KeyN', o: 'KeyO', p: 'KeyP', q: 'KeyQ', r: 'KeyR',
  s: 'KeyS', t: 'KeyT', u: 'KeyU', v: 'KeyV', w: 'KeyW', x: 'KeyX',
  y: 'KeyY', z: 'KeyZ',
  // Numbers
  '0': 'Digit0', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4',
  '5': 'Digit5', '6': 'Digit6', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9',
};

/**
 * Special keys that use event.key instead of event.code for matching.
 */
const SPECIAL_KEYS = new Set([
  'Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

/**
 * Parse a keybinding descriptor into a normalized Keybinding object.
 * 
 * @param descriptor - Abstract keybinding descriptor (e.g., 'Mod+D', 'Delete | Backspace')
 * @param options - Optional context and repeat prevention settings
 * @returns Array of parsed keybindings (multiple if alternatives are specified)
 */
export function parseKeybinding(
  descriptor: KeybindingDescriptor,
  options?: { when?: KeybindingContext; preventRepeat?: boolean }
): Keybinding[] {
  const platform = getCurrentPlatform();
  const alternatives = descriptor.split('|').map(s => s.trim());
  
  return alternatives.map(alt => {
    const parts = alt.split('+').map(s => s.trim());
    const keybinding: Keybinding = {
      key: '',
      when: options?.when,
      preventRepeat: options?.preventRepeat ?? true,
    };

    let keyPart = '';
    for (const part of parts) {
      const lower = part.toLowerCase();
      
      if (lower === 'mod') {
        // Expand 'Mod' to platform-specific modifier
        if (platform === 'mac') {
          keybinding.meta = true;
        } else {
          keybinding.ctrl = true;
        }
      } else if (lower === 'ctrl' || lower === 'control') {
        keybinding.ctrl = true;
      } else if (lower === 'shift') {
        keybinding.shift = true;
      } else if (lower === 'alt' || lower === 'option') {
        keybinding.alt = true;
      } else if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
        keybinding.meta = true;
      } else {
        // This is the key part
        keyPart = part;
      }
    }

    if (!keyPart) {
      throw new Error(`Invalid keybinding descriptor: ${descriptor} - no key specified`);
    }

    // Convert key to physical key code or special key name
    const keyLower = keyPart.toLowerCase();
    if (SPECIAL_KEYS.has(keyPart)) {
      // Special keys use event.key
      keybinding.key = keyPart;
      keybinding.keyFallback = keyPart;
    } else if (KEY_CODE_MAP[keyLower]) {
      // Character keys use event.code for layout independence
      keybinding.key = KEY_CODE_MAP[keyLower];
      keybinding.keyFallback = keyLower;
    } else {
      // Unknown key, use as-is (might be a custom key)
      keybinding.key = keyPart;
      keybinding.keyFallback = keyPart;
    }

    return keybinding;
  });
}

/**
 * Format a keybinding descriptor for display on the current platform.
 * 
 * @param descriptor - Abstract keybinding descriptor
 * @param platform - Target platform (defaults to current platform)
 * @returns Formatted display string (e.g., '⌘D' on Mac, 'Ctrl+D' on Windows)
 */
export function formatKeybindingForDisplay(
  descriptor: KeybindingDescriptor,
  platform?: Platform
): string {
  const targetPlatform = platform ?? getCurrentPlatform();
  
  // For descriptors with alternatives (|), show only the first one
  const primaryDescriptor = descriptor.split('|')[0].trim();
  const parts = primaryDescriptor.split('+').map(s => s.trim());
  
  const symbols: string[] = [];
  let keyPart = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    
    if (lower === 'mod') {
      if (targetPlatform === 'mac') {
        symbols.push('⌘');
      } else {
        symbols.push('Ctrl');
      }
    } else if (lower === 'ctrl' || lower === 'control') {
      symbols.push(targetPlatform === 'mac' ? '⌃' : 'Ctrl');
    } else if (lower === 'shift') {
      symbols.push(targetPlatform === 'mac' ? '⇧' : 'Shift');
    } else if (lower === 'alt' || lower === 'option') {
      symbols.push(targetPlatform === 'mac' ? '⌥' : 'Alt');
    } else if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
      symbols.push(targetPlatform === 'mac' ? '⌘' : 'Meta');
    } else {
      keyPart = part;
    }
  }

  // Format the key part
  let formattedKey = keyPart;
  if (keyPart.length === 1) {
    formattedKey = keyPart.toUpperCase();
  } else if (keyPart === 'Backspace') {
    formattedKey = targetPlatform === 'mac' ? '⌫' : 'Backspace';
  } else if (keyPart === 'Delete') {
    formattedKey = targetPlatform === 'mac' ? '⌦' : 'Delete';
  } else if (keyPart === 'Enter') {
    formattedKey = targetPlatform === 'mac' ? '↩' : 'Enter';
  } else if (keyPart === 'Escape') {
    formattedKey = targetPlatform === 'mac' ? '⎋' : 'Esc';
  } else if (keyPart === 'Space') {
    formattedKey = targetPlatform === 'mac' ? '␣' : 'Space';
  } else if (keyPart === 'Tab') {
    formattedKey = targetPlatform === 'mac' ? '⇥' : 'Tab';
  }

  // Combine modifiers and key
  if (targetPlatform === 'mac') {
    // Mac: symbols directly concatenated (⌘D, ⌘⇧Z)
    return symbols.join('') + formattedKey;
  } else {
    // Windows/Linux: symbols with + separator (Ctrl+D, Ctrl+Shift+Z)
    return [...symbols, formattedKey].join('+');
  }
}

/**
 * Evaluate a context clause against the current editor context.
 * 
 * @param whenClause - Context clause to evaluate (e.g., 'viewportFocused && !isModalOpen')
 * @param context - Current editor context state
 * @returns True if the context clause is satisfied
 */
export function evaluateContext(
  whenClause: KeybindingContext | undefined,
  context: EditorContextState
): boolean {
  if (!whenClause) {
    return true; // No context clause means always enabled
  }

  // Simple boolean expression parser
  // Supported operators: !, &&, ||, ()
  // Context keys: viewportFocused, sceneTreeFocused, inspectorFocused, assetsFocused, isInputFocused, isModalOpen
  
  const contextValues: Record<string, boolean> = {
    viewportFocused: context.focusedArea === 'viewport',
    sceneTreeFocused: context.focusedArea === 'scene-tree',
    inspectorFocused: context.focusedArea === 'inspector',
    assetsFocused: context.focusedArea === 'assets',
    isInputFocused: context.isInputFocused,
    isModalOpen: context.isModalOpen,
  };

  // Replace context keys with their boolean values
  let expression = whenClause;
  for (const [key, value] of Object.entries(contextValues)) {
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    expression = expression.replace(regex, value.toString());
  }

  try {
    // Evaluate the boolean expression
    // Note: Using Function constructor is safe here since we've replaced all context keys
    // with boolean values and the expression only contains boolean operators
    // eslint-disable-next-line no-new-func
    return new Function(`return ${expression}`)() as boolean;
  } catch {
    console.warn(`Failed to evaluate keybinding context: ${whenClause}`);
    return false;
  }
}
