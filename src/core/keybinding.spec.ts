import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseKeybinding,
  formatKeybindingForDisplay,
  evaluateContext,
} from './keybinding';
import type { EditorContextState } from '@/state/AppState';
import { _clearPlatformCache } from '@/fw/platform';

describe('keybinding.ts', () => {
  beforeEach(() => {
    _clearPlatformCache();
  });

  describe('parseKeybinding', () => {
    it('should parse simple key descriptors', () => {
      const result = parseKeybinding('D');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('KeyD');
      expect(result[0].keyFallback).toBe('d');
      expect(result[0].preventRepeat).toBe(true);
      expect(result[0].ctrl).toBeUndefined();
      expect(result[0].shift).toBeUndefined();
    });

    it('should parse Mod+Key on Mac as Meta', () => {
      // Mock Mac platform
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        writable: true,
        configurable: true,
      });
      _clearPlatformCache();

      const result = parseKeybinding('Mod+D');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('KeyD');
      expect(result[0].meta).toBe(true);
      expect(result[0].ctrl).toBeUndefined();
    });

    it('should parse Mod+Key on Windows as Ctrl', () => {
      // Mock Windows platform
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        writable: true,
        configurable: true,
      });
      _clearPlatformCache();

      const result = parseKeybinding('Mod+D');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('KeyD');
      expect(result[0].ctrl).toBe(true);
      expect(result[0].meta).toBeUndefined();
    });

    it('should parse multiple modifiers', () => {
      const result = parseKeybinding('Mod+Shift+Z');
      expect(result).toHaveLength(1);
      expect(result[0].shift).toBe(true);
    });

    it('should parse alternative keybindings separated by |', () => {
      const result = parseKeybinding('Mod+Shift+Z | Ctrl+Y');
      expect(result).toHaveLength(2);
      expect(result[0].shift).toBe(true);
      expect(result[1].key).toBe('KeyY');
    });

    it('should parse special keys', () => {
      const result = parseKeybinding('Delete');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        key: 'Delete',
        keyFallback: 'Delete',
      });
    });

    it('should parse digit keys', () => {
      const result = parseKeybinding('2');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        key: 'Digit2',
        keyFallback: '2',
      });
    });

    it('should apply when context', () => {
      const result = parseKeybinding('Delete', { when: 'viewportFocused' });
      expect(result).toHaveLength(1);
      expect(result[0].when).toBe('viewportFocused');
    });

    it('should apply preventRepeat option', () => {
      const result = parseKeybinding('W', { preventRepeat: false });
      expect(result).toHaveLength(1);
      expect(result[0].preventRepeat).toBe(false);
    });
  });

  describe('formatKeybindingForDisplay', () => {
    it('should format for Mac with symbols', () => {
      const result = formatKeybindingForDisplay('Mod+D', 'mac');
      expect(result).toBe('⌘D');
    });

    it('should format for Windows with text', () => {
      const result = formatKeybindingForDisplay('Mod+D', 'windows');
      expect(result).toBe('Ctrl+D');
    });

    it('should format multiple modifiers on Mac', () => {
      const result = formatKeybindingForDisplay('Mod+Shift+Z', 'mac');
      expect(result).toBe('⌘⇧Z');
    });

    it('should format multiple modifiers on Windows', () => {
      const result = formatKeybindingForDisplay('Mod+Shift+Z', 'windows');
      expect(result).toBe('Ctrl+Shift+Z');
    });

    it('should format Alt key', () => {
      const resultMac = formatKeybindingForDisplay('Alt+F', 'mac');
      const resultWin = formatKeybindingForDisplay('Alt+F', 'windows');
      expect(resultMac).toBe('⌥F');
      expect(resultWin).toBe('Alt+F');
    });

    it('should format special keys', () => {
      const resultMac = formatKeybindingForDisplay('Delete', 'mac');
      const resultWin = formatKeybindingForDisplay('Delete', 'windows');
      expect(resultMac).toBe('⌦');
      expect(resultWin).toBe('Delete');
    });

    it('should show only first alternative for display', () => {
      const result = formatKeybindingForDisplay('Mod+Shift+Z | Ctrl+Y', 'mac');
      expect(result).toBe('⌘⇧Z');
    });
  });

  describe('evaluateContext', () => {
    const mockContext: EditorContextState = {
      focusedArea: 'viewport',
      isInputFocused: false,
      isModalOpen: false,
    };

    it('should return true when no context clause is provided', () => {
      expect(evaluateContext(undefined, mockContext)).toBe(true);
    });

    it('should evaluate simple context key', () => {
      expect(evaluateContext('viewportFocused', mockContext)).toBe(true);
      expect(evaluateContext('sceneTreeFocused', mockContext)).toBe(false);
    });

    it('should evaluate negation operator', () => {
      expect(evaluateContext('!isInputFocused', mockContext)).toBe(true);
      expect(evaluateContext('!viewportFocused', mockContext)).toBe(false);
    });

    it('should evaluate && operator', () => {
      expect(evaluateContext('viewportFocused && !isInputFocused', mockContext)).toBe(true);
      expect(evaluateContext('viewportFocused && isInputFocused', mockContext)).toBe(false);
    });

    it('should evaluate || operator', () => {
      expect(evaluateContext('viewportFocused || sceneTreeFocused', mockContext)).toBe(true);
      expect(evaluateContext('sceneTreeFocused || inspectorFocused', mockContext)).toBe(false);
    });

    it('should evaluate complex expressions', () => {
      expect(
        evaluateContext('(viewportFocused || sceneTreeFocused) && !isModalOpen', mockContext)
      ).toBe(true);
    });

    it('should handle input focus context', () => {
      const inputFocusedContext: EditorContextState = {
        ...mockContext,
        isInputFocused: true,
      };
      expect(evaluateContext('!isInputFocused', inputFocusedContext)).toBe(false);
      expect(evaluateContext('isInputFocused', inputFocusedContext)).toBe(true);
    });

    it('should handle modal open context', () => {
      const modalContext: EditorContextState = {
        ...mockContext,
        isModalOpen: true,
      };
      expect(evaluateContext('!isModalOpen', modalContext)).toBe(false);
      expect(evaluateContext('isModalOpen', modalContext)).toBe(true);
    });
  });
});
