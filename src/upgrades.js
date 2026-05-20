// Uppgraderingar - allt sker via tabellen UPGRADES så det är lätt
// för Melwin att justera siffror och se vad som händer.
const UPGRADES = {
  axe: {
    label: '🪓 Yxa',
    description: 'Hugger träd snabbare',
    maxLevel: 5,
    cost: (level) => 20 * Math.pow(2, level),
    chopTime: (level) => 2.0 - level * 0.3,
  },
  rod: {
    label: '🎣 Metspö',
    description: 'Fiskar snabbare',
    maxLevel: 5,
    cost: (level) => 30 * Math.pow(2, level),
    fishTime: (level) => 4.0 - level * 0.6,
  },
  backpack: {
    label: '🎒 Ryggsäck',
    description: '+5 plats per nivå',
    maxLevel: 5,
    cost: (level) => 25 * Math.pow(2, level),
    capacity: (level) => 10 + level * 5,
  },
  boots: {
    label: '👟 Skor',
    description: 'Rör dig snabbare',
    maxLevel: 5,
    cost: (level) => 15 * Math.pow(2, level),
    speed: (level) => 5 + level * 1.2,
  },
};

export class Upgrades {
  constructor() {
    this.levels = {
      axe: 0,
      rod: 0,
      backpack: 0,
      boots: 0,
    };
  }

  getDefinition(key) {
    return UPGRADES[key];
  }

  getAllKeys() {
    return Object.keys(UPGRADES);
  }

  getLevel(key) {
    return this.levels[key];
  }

  isMaxed(key) {
    return this.levels[key] >= UPGRADES[key].maxLevel;
  }

  getCost(key) {
    if (this.isMaxed(key)) return null;
    return UPGRADES[key].cost(this.levels[key]);
  }

  buy(key, inventory) {
    if (this.isMaxed(key)) return false;
    const cost = this.getCost(key);
    if (inventory.gold < cost) return false;
    inventory.gold -= cost;
    this.levels[key] += 1;
    inventory.capacity = UPGRADES.backpack.capacity(this.levels.backpack);
    return true;
  }

  getAxeChopTime() {
    return UPGRADES.axe.chopTime(this.levels.axe);
  }

  getFishTime() {
    return UPGRADES.rod.fishTime(this.levels.rod);
  }

  getMoveSpeed() {
    return UPGRADES.boots.speed(this.levels.boots);
  }

  getCapacity() {
    return UPGRADES.backpack.capacity(this.levels.backpack);
  }
}
