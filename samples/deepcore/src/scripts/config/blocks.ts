import { BlocksConfig } from './types';
import blockDirtUrl from '../assets/models/blockdirt.glb?url';
import blockStoneUrl from '../assets/models/blockstone.glb?url';
import blockIronUrl from '../assets/models/blockiron.glb?url';
import blockGoldUrl from '../assets/models/blockgold.glb?url';
import blockSilverUrl from '../assets/models/blocksilver.glb?url';
import blockDiamondUrl from '../assets/models/blockdiamond.glb?url';

export const blocksConfig: BlocksConfig = {
  // Типы блоков и их идентификаторы
  blockTypes: {
    AIR: 0,         // Воздух (пустота)
    BEDROCK: 1,     // Коренная порода (неразрушимая)
    DIRT: 2,        // Земля
    STONE: 3,       // Камень
    IRON_ORE: 4,    // Железная руда
    SILVER_ORE: 5,  // Серебряная руда
    GOLD_ORE: 6,    // Золотая руда
    DIAMOND_ORE: 7, // Алмазная руда
    UNSTABLE: 8     // Нестабильный взрывающийся блок
  },

  // Свойства каждого типа блока
  blockProperties: {
    "0": { // AIR
      hp: 0,
      density: 0,
      hardness: 0,
      adhesion: false,
      color: 0,
      gripForce: 0,
      fragility: 0,
      impactForce: 0,
      energyAbsorption: 0,
      mass: 0
    },
    "1": { // BEDROCK
      hp: Infinity,     // Прочность
      density: 10,       // Плотность (влияет на физику падения)
      hardness: Infinity, // Твердость (сопротивление урону)
      adhesion: true,    // Прилипание к соседям (не падает)
      color: 0x1a1a1a, // Цвет
      gripForce: 1.0, // Сила сцепления
      fragility: 0, // Хрупкость
      impactForce: 1.0, // Сила удара
      energyAbsorption: 0.1, // Поглощение энергии
      mass: 10 // Масса блока
    },
    "2": { // DIRT
      hp: 50,
      density: 1,
      hardness: 0.5,
      adhesion: true, // Падает, если нет опоры
      color: 0x8b4513,
      gripForce: 0.5,
      fragility: 1.0,
      impactForce: 0.8,
      energyAbsorption: 0.7,
      mass: 1,
      modelPath: blockDirtUrl,
      scale: 0.45,
      randomRotation: true
    },
    "3": { // STONE
      hp: 150,
      density: 2,
      hardness: 1.5,
      adhesion: true,  // Держится за соседей
      color: 0x808080,
      gripForce: 1.0,
      fragility: 0.4,
      impactForce: 1.5,
      energyAbsorption: 0.1,
      modelPath: blockStoneUrl,
      scale: 0.45,
      randomRotation: true, 
      mass: 2
    },
    "4": { // IRON_ORE
      hp: 225,
      density: 3,
      hardness: 2,
      adhesion: true,
      color: 0xd4a574,
      gripForce: 1.0,
      fragility: 0.2,
      impactForce: 2.5,
      energyAbsorption: 0.05,
      modelPath: blockIronUrl,
      scale: 0.45,
      randomRotation: true,
      mass: 5
    },
    "5": { // SILVER_ORE
      hp: 180,
      density: 4,
      hardness: 1.8,
      adhesion: true,
      color: 0xc0c0c0,
      gripForce: 1.0,
      fragility: 0.6,
      impactForce: 1.2,
      energyAbsorption: 0.1,
      modelPath: blockSilverUrl,
      scale: 0.45,
      randomRotation: true,
      mass: 4
    },
    "6": { // GOLD_ORE
      hp: 180,
      density: 4,
      hardness: 1.8,
      adhesion: true,
      color: 0xffd700,
      gripForce: 1.0,
      fragility: 0.6,
      impactForce: 1.2,
      energyAbsorption: 0.1,
      modelPath: blockGoldUrl,
      scale: 0.45,
      randomRotation: true,
      mass: 4
    },
    "7": { // DIAMOND_ORE
      hp: 300,
      density: 3.5,
      hardness: 3,
      adhesion: true,
      color: 0x00ffff,
      gripForce: 1.0,
      fragility: 1.8,
      impactForce: 1.0,
      energyAbsorption: 0.05,
      modelPath: blockDiamondUrl,
      scale: 0.45,
      randomRotation: true,
      mass: 3
    },
    "8": { // UNSTABLE
      hp: 90,           // Enough headroom for visible HP loss across several hits
      density: 2.0,
      hardness: 1.0,
      adhesion: true,
      color: 0xff4500,  // Ярко-оранжевый / красный цвет
      gripForce: 1.0,
      fragility: 1.0,
      impactForce: 1.0,
      energyAbsorption: 0.0,
      mass: 2,
      explosionRadius: 2.5, // Радиус взрыва в блоках
      explosionDamage: 250   // Урон блокам от взрыва
    }
  }
};

// Mapping of block types to droppable items they spawn on destruction
export const BLOCK_DROPPED_ITEMS: Record<number, Record<string, number>> = {
  0: {}, // AIR - drops nothing
  1: {}, // BEDROCK - drops nothing (indestructible)
  2: { stone: 0.2 }, // DIRT - drops stone with 20% chance
  3: { stone: 1 }, // STONE - drops 1 stone
  4: { iron: 1, stone: 1 }, // IRON_ORE - drops 1 iron + 1 stone
  5: { silver: 1, stone: 1 }, // SILVER_ORE - drops 1 silver + 1 stone
  6: { gold: 1, stone: 1 }, // GOLD_ORE - drops 1 gold + 1 stone
  7: { diamond: 1, stone: 1 }, // DIAMOND_ORE - drops 1 diamond + 1 stone
  8: {}, // UNSTABLE - drops nothing
};
