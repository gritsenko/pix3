import { type BotConfig } from '../core/Types';
import vacubotUrl from '../../assets/models/vacubot.glb?url';

export const botConfig: BotConfig = {
  // Navigation and movement settings
  navigation: {
    speed: 2.0,                    // Movement speed (units per second)
    sphereRadius: 0.25,            // Collider radius (smaller than body cylinder)
    stuckDetectionTime: 3.0,       // Time before detecting stuck (seconds)
    recoveryTime: 5.0,             // Time to recover after falling (seconds)
    scanRange: 1000,               // Range to scan for resources (blocks)
    raycastDistance: 5.0,          // Raycast distance for surface detection
    surfaceOffset: 0.1,            // Offset from surface for smooth sliding
    maxErrorCount: 3,              // Max errors before giving up
    pathRetryCooldown: 0.5,        // Delay between failed path retries (seconds)
    maxPathRetries: 3,             // Failed retries before marking target unreachable
    unreachableTargetCooldown: 8.0 // Time to ignore unreachable targets (seconds)
  },

  // Collection settings
  collection: {
    collectionRange: 0.8,          // Radius to collect items (relative to block size)
    searchInterval: 1.0,           // Time between resource searches (seconds)
    collectInterval: 0.1           // Time between collection checks (seconds)
  },

  // Visual settings
  visual: {
    modelPath: vacubotUrl,
    scale: 0.50,                   // Scale adapted for vacubot.glb
    color: 0xffffff,               // Default bot color (green)
    errorColor: 0xff0000,          // Error state color (red)
    recoveryColor: 0xffff00        // Recovery state color (yellow)
  },

  // Debug settings
  debug: {
    showCollider: false,            // Show sphere collider in debug mode
    showPath: true,               // Show movement path (future feature)
    showTarget: false,              // Highlight current target
    logStateChanges: false,         // Log state changes to console
    logCollection: true,           // Log collection activities
    logErrors: true,               // Log error events
    logNavigation: false           // Log bot pathfinding/navigation details
  }
};

// Block value scoring for resource prioritization
export const BLOCK_VALUES: Record<number, number> = {
  2: 1,    // DIRT - lowest value
  3: 5,    // STONE - medium value
  4: 10,   // IRON_ORE - high value
  5: 15,   // GOLD_ORE - very high value
  6: 20    // DIAMOND_ORE - highest value
};

// Block hardness for mining difficulty
export const BLOCK_HARDNESS: Record<number, number> = {
  2: 1.0,  // DIRT - easy to mine
  3: 1.5,  // STONE - medium difficulty
  4: 2.0,  // IRON_ORE - hard to mine
  5: 1.8,  // GOLD_ORE - medium-hard
  6: 3.0   // DIAMOND_ORE - very hard
};