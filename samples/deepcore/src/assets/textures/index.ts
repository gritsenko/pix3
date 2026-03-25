/**
 * Centralized texture asset registry
 * Uses URL imports (Vite-compatible) for texture path resolution
 */

// Helper to get public assets path respecting subfolder deployments
const getPublicUrl = (path: string): string => {
  const baseUrl = import.meta.env.BASE_URL || './';
  // Ensure we don't end up with // if path starts with /
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return normalizedBase + normalizedPath;
};

// Atlas configuration
export const ATLAS_CONFIG = {
  game: {
    image: getPublicUrl('textures/game_atlas.png'),
    json: getPublicUrl('textures/game_atlas.json')
  }
};

export const TEXTURES = {
  // Background - Using new URL() directly with string literals so Vite can analyze and bundle them
  backGradient: new URL('./back_gradient.jpg', import.meta.url).href,

  // Environment map for reflections/ambient
  envMap: getPublicUrl('textures/env.jpg'),


  // Walls
  wallTexture: new URL('./wall_texture.jpg', import.meta.url).href,
  wallNormal: new URL('./wall_normal.jpg', import.meta.url).href,

  // UI (from atlas)
  inventory_bg: new URL('./ui/inventory.jpg', import.meta.url).href, // JPG not in atlas
  items: {
    axe: 'ui/item_axe.png',
    shovel: 'ui/item_showel.png',
    jackhammer: 'ui/item_jackhammer.png',
  },
  avatar: 'avatar.png',

  // Droppable items (from atlas)
  droppables: {
    gold: 'gold_1.png',
    stone: 'stone_1.png',
    iron: 'stone_3.png',
    diamond: 'stone_5.png',
    gem: 'gem_1.png',
  },
};

export default TEXTURES;
