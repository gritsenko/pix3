/**
 * Centralized texture asset registry.
 * These are direct asset URLs, not atlas frame references.
 */

const assetUrl = (path: string): string => new URL(path, import.meta.url).href;

export const TEXTURES = {
  // Background
  backGradient: assetUrl('./back_gradient.jpg'),

  // Environment map for reflections/ambient
  envMap: assetUrl('./background.jpg'),

  // Shared color lookup texture for block materials
  colormap: new URL('../models/colormap.png', import.meta.url).href,


  // Walls
  wallTexture: assetUrl('./wall_texture.jpg'),
  wallNormal: assetUrl('./wall_normal.jpg'),

  // UI
  inventory_bg: assetUrl('./ui/inventory.jpg'),
  items: {
    axe: assetUrl('./ui/item_axe.png'),
    shovel: assetUrl('./ui/item_showel.png'),
    jackhammer: assetUrl('./ui/item_jackhammer.png'),
  },
  avatar: assetUrl('./avatar.png'),

  // Droppable items
  droppables: {
    gold: assetUrl('./gold_1.png'),
    stone: assetUrl('./stone_1.png'),
    iron: assetUrl('./stone_3.png'),
    diamond: assetUrl('./stone_5.png'),
    gem: assetUrl('./stone_6.png'),
  },
};

export default TEXTURES;
