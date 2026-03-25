import { create } from 'zustand';
import { ToolType } from './Types';
import { INITIAL_STATE, UPGRADES } from '../config';
import { HapticSystem } from '../systems/HapticSystem';
import { ADRENALINE_CONFIG } from '../config/gameplay';

const SOUND_STORAGE_KEY = 'deepcore.soundEnabled';

function readStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function storeSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage failures and keep runtime state only.
  }
}

// Game State Interface
export interface GameState {
  // Resources
  gold: number;
  gems: number;
  
  // Progression
  depth: number;
  maxDepth: number;
  
  // Fuel
  fuel: number;
  maxFuel: number;
  
  // Tools
  currentTool: ToolType;
  toolDamageMultiplier: number;
  
  // Upgrades
  damageLevel: number;
  hasBot: boolean;
  
  // Turbo Mode
  turboActive: boolean;
  turboFuel: number;
  maxTurboFuel: number;

  // Adrenaline
  adrenaline: number;
  maxAdrenaline: number;
  
  // Debug Mode
  debugVisuals: boolean;
  debugMode: boolean;
  showFPS: boolean;
  soundEnabled: boolean;

  // Actions
  addGold: (amount: number) => void;
  addGems: (amount: number) => void;
  setDepth: (depth: number) => void;
  setFuel: (fuel: number) => void;
  consumeFuel: (amount: number) => boolean;
  setCurrentTool: (tool: ToolType) => void;
  upgradeDamage: () => boolean;
  buyBot: () => boolean;
  buyTurboFuel: () => boolean;
  activateTurbo: () => void;
  deactivateTurbo: () => void;
  consumeTurboFuel: (amount: number) => void;
  addAdrenaline: (amount: number) => void;
  toggleDebugVisuals: () => void;
  toggleDebugMode: () => void;
  toggleShowFPS: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSoundEnabled: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  gold: INITIAL_STATE.gold,
  gems: INITIAL_STATE.gems,
  depth: INITIAL_STATE.depth,
  maxDepth: INITIAL_STATE.maxDepth,
  fuel: INITIAL_STATE.fuel,
  maxFuel: INITIAL_STATE.maxFuel,
  currentTool: INITIAL_STATE.currentTool as ToolType,
  toolDamageMultiplier: INITIAL_STATE.toolDamageMultiplier,
  damageLevel: INITIAL_STATE.damageLevel,
  hasBot: INITIAL_STATE.hasBot,
  turboActive: INITIAL_STATE.turboActive,
  turboFuel: INITIAL_STATE.turboFuel,
  maxTurboFuel: INITIAL_STATE.maxTurboFuel,
  adrenaline: 0,
  maxAdrenaline: ADRENALINE_CONFIG.maxValue,
  debugVisuals: INITIAL_STATE.debugVisuals,
  debugMode: INITIAL_STATE.debugMode,
  showFPS: INITIAL_STATE.showFPS,
  soundEnabled: readStoredSoundEnabled(),
  
  // Actions
  addGold: (amount) => set((state) => ({ gold: state.gold + amount })),
  
  addGems: (amount) => set((state) => ({ gems: state.gems + amount })),
  
  setDepth: (depth) => set((state) => ({
    depth,
    maxDepth: Math.max(state.maxDepth, depth),
  })),
  
  setFuel: (fuel) => set((state) => ({
    fuel: Math.max(0, Math.min(fuel, state.maxFuel)),
  })),
  
  consumeFuel: (amount) => {
    const state = get();
    if (state.fuel >= amount) {
      set({ fuel: state.fuel - amount });
      return true;
    }
    return false;
  },
  
  setCurrentTool: (tool) => {
    HapticSystem.toolSwitching();
    set({ currentTool: tool });
  },
  
  upgradeDamage: () => {
    const state = get();
    const cost = UPGRADES.damage.baseCost * Math.pow(UPGRADES.damage.costMultiplier, state.damageLevel);
    if (state.gold >= cost) {
      set({
        gold: state.gold - cost,
        damageLevel: state.damageLevel + 1,
        toolDamageMultiplier: state.toolDamageMultiplier * UPGRADES.damage.damageMultiplier,
      });
      return true;
    }
    return false;
  },
  
  buyBot: () => {
    const state = get();
    if (state.gold >= UPGRADES.bot.cost && !state.hasBot) {
      set({
        gold: state.gold - UPGRADES.bot.cost,
        hasBot: true,
      });
      return true;
    }
    return false;
  },
  
  buyTurboFuel: () => {
    const state = get();
    if (state.gold >= UPGRADES.turboFuel.cost) {
      set({
        gold: state.gold - UPGRADES.turboFuel.cost,
        turboFuel: state.maxTurboFuel,
      });
      return true;
    }
    return false;
  },
  
  activateTurbo: () => {
    const state = get();
    if (state.turboFuel > 0) {
      set({ turboActive: true });
    }
  },
  
  deactivateTurbo: () => set({ turboActive: false }),
  
  consumeTurboFuel: (amount) => {
    const state = get();
    const newFuel = Math.max(0, state.turboFuel - amount);
    set({ turboFuel: newFuel });
    if (newFuel <= 0) {
      set({ turboActive: false });
    }
  },

  addAdrenaline: (amount) => set((state) => ({
    adrenaline: Math.max(0, Math.min(state.adrenaline + amount, state.maxAdrenaline)),
  })),
  
  toggleDebugVisuals: () => {
    const state = get();
    set({ debugVisuals: !state.debugVisuals });
  },

  toggleDebugMode: () => {
    const state = get();
    set({ debugMode: !state.debugMode });
  },

  toggleShowFPS: () => {
    const state = get();
    set({ showFPS: !state.showFPS });
  },

  setSoundEnabled: (enabled) => {
    storeSoundEnabled(enabled);
    set({ soundEnabled: enabled });
  },

  toggleSoundEnabled: () => {
    const nextValue = !get().soundEnabled;
    storeSoundEnabled(nextValue);
    set({ soundEnabled: nextValue });
  },
}));

// Helper to get current damage multiplier including turbo
export function getTotalDamageMultiplier(): number {
  const state = useGameStore.getState();
  const turboMultiplier = state.turboActive ? 2 : 1;
  const adrenalineMultiplier = state.adrenaline >= ADRENALINE_CONFIG.threshold ? 2 : 1;
  return state.toolDamageMultiplier * turboMultiplier * adrenalineMultiplier;
}

// Helper to get upgrade cost
export function getDamageUpgradeCost(): number {
  const state = useGameStore.getState();
  return Math.floor(UPGRADES.damage.baseCost * Math.pow(UPGRADES.damage.costMultiplier, state.damageLevel));
}

// Export costs for UI
export const UPGRADE_COSTS = {
  BOT: UPGRADES.bot.cost,
  TURBO_FUEL: UPGRADES.turboFuel.cost,
  getDamageCost: getDamageUpgradeCost,
};
