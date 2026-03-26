import { type ToolsConfig } from './types';

export const toolsConfig: ToolsConfig = {
  // Список доступных инструментов
  toolTypes: {
    PICKAXE: "pickaxe",
    SHOVEL: "shovel",
    DRILL: "drill"
  },

  // Параметры для каждого инструмента
  toolProperties: {
    // Кирка: хорошо ломает камень, плохо землю
    pickaxe: {
      baseDamage: 15,          // Базовый урон за удар
      stoneMultiplier: 1.5,    // Эффективность против камня
      dirtMultiplier: 0.5,     // Эффективность против земли
      inputMode: "tap",        // Работает по нажатию
      fuelCost: 1,             // Трата топлива за действие
      multiTouchAllowed: true,  // Можно бить несколькими пальцами
      impactType: "stability",
      impactRadius: 1,
      screenShake: {
        amplitude: 0.01,       // Slightly stronger shake for pickaxe
        duration: 0.05
      }
    },
    // Лопата: хорошо копает землю, плохо камень
    shovel: {
      baseDamage: 15,
      stoneMultiplier: 0.5,
      dirtMultiplier: 1.5,
      inputMode: "tap",
      fuelCost: 1,
      multiTouchAllowed: true,
      impactType: "none", // No impact on neighbors for shovel
      screenShake: {
        amplitude: 0.01,        // Slightly weaker shake for shovel
        duration: 0.15
      }
    },
    // Дрель: медленно, но непрерывно
    drill: {
      baseDamage: 5,           // Меньше урона, но работает чаще
      stoneMultiplier: 1.0,
      dirtMultiplier: 1.0,
      inputMode: "hold",       // Работает при удержании
      tickRate: 100,           // Интервал срабатывания (мс)
      fuelCost: 0.5,           // Трата топлива за тик
      multiTouchAllowed: false, // Только один палец
      impactType: "damage",
      screenShake: {
        amplitude: 0.05,       // Weak shake for rapid drill hits
        duration: 0.08
      }
    }
  },

  // Настройки улучшений в магазине
  upgrades: {
    // Улучшение урона (прогрессивное)
    damage: {
      baseCost: 50,            // Начальная цена
      costMultiplier: 1.5,     // Во сколько раз растет цена
      damageMultiplier: 1.25   // Во сколько раз растет урон
    },
    // Дрон-помощник (единоразовая покупка)
    bot: {
      cost: 100
    },
    // Турбо-топливо (ускорение)
    turboFuel: {
      cost: 30,
      damageMultiplier: 2      // Бонус к урону в режиме турбо
    }
  }
};
