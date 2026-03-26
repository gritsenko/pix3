/**
 * Centralized texture asset registry.
 * These are direct asset URLs, not atlas frame references.
 */

export const TEXTURES = {
  // Background
  backGradient: new URL('./back_gradient.jpg', import.meta.url).href,

  // Environment map for reflections/ambient
  envMap: new URL('./background.jpg', import.meta.url).href,

  // Shared color lookup texture for block materials
  colormap: new URL('../models/colormap.png', import.meta.url).href,


  // Walls
  wallTexture: new URL('./wall_texture.jpg', import.meta.url).href,
  wallNormal: new URL('./wall_normal.jpg', import.meta.url).href,

  // UI
  inventory_bg: new URL('./ui/inventory.jpg', import.meta.url).href,
  items: {
    axe: new URL('./ui/item_axe.png', import.meta.url).href,
    shovel: new URL('./ui/item_showel.png', import.meta.url).href,
    jackhammer: new URL('./ui/item_jackhammer.png', import.meta.url).href,
  },
  avatar: new URL('./avatar.png', import.meta.url).href,

  // Droppable items
  droppables: {
    gold: new URL('./gold_1.png', import.meta.url).href,
    stone: new URL('./stone_1.png', import.meta.url).href,
    iron: new URL('./stone_3.png', import.meta.url).href,
    diamond: new URL('./stone_5.png', import.meta.url).href,
    gem: new URL('./stone_6.png', import.meta.url).href,
  },
};

export default TEXTURES;
