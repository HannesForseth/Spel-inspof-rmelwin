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
  sword: {
    label: '⚔️ Svärd',
    description: 'Närstrid - mer skada',
    maxLevel: 5,
    cost: (level) => (level === 0 ? 40 : 40 * Math.pow(2, level)),
    damage: (level) => (level === 0 ? 0 : level + 1),
  },
  bow: {
    label: '🏹 Pilbåge',
    description: 'Långdistans med autosikte (kräver pilar)',
    maxLevel: 5,
    cost: (level) => (level === 0 ? 80 : 80 * Math.pow(2, level)),
    // Nerfad - lägre skada än svärd, men säkrare från avstånd
    damage: (level) => (level === 0 ? 0 : level),
    range: (level) => 11 + level * 1.5,
  },
  shield: {
    label: '🛡️ Sköld',
    description: 'Minskar inkommande skada',
    maxLevel: 5,
    cost: (level) => (level === 0 ? 60 : 60 * Math.pow(2, level)),
    defense: (level) => (level === 0 ? 0 : 1 + level),
  },
  armor: {
    label: '🥋 Rustning',
    description: 'Solid rustning som tål mer',
    maxLevel: 5,
    cost: (level) => (level === 0 ? 100 : 100 * Math.pow(2, level)),
    defense: (level) => (level === 0 ? 0 : 2 + level * 2),
  },
};

// Recept för tillverkning (Köpmannens "Tillverka"-flik)
export const RECIPES = {
  arrows: {
    label: '🏹 Pilar',
    description: '1 trä → 4 pilar',
    input: { wood: 1 },
    output: { arrows: 4 },
  },
  cook: {
    label: '🍖 Tillaga kött',
    description: '1 rått kött → 1 tillagat (alternativ till elden)',
    input: { meat: 1 },
    output: { cookedMeat: 1 },
  },
  sword_basic: {
    label: '⚔️ Träsvärd',
    description: 'Ditt första svärd. Hård kärnträ + lädergrepp.',
    input: { wood: 5, hide: 2 },
    grantUpgrade: 'sword',
    requireLevel: 0,
  },
  bow_basic: {
    label: '🏹 Enkel pilbåge',
    description: 'Smidig pilbåge av spänstig björk.',
    input: { wood: 8, hide: 2 },
    grantUpgrade: 'bow',
    requireLevel: 0,
  },
  shield_basic: {
    label: '🛡️ Träsköld',
    description: 'Plankor med lädergrepp på baksidan.',
    input: { wood: 4, hide: 3 },
    grantUpgrade: 'shield',
    requireLevel: 0,
  },
  armor_basic: {
    label: '🥋 Läderrustning',
    description: 'Stickad och stoppad — bättre än ingen.',
    input: { hide: 6, wood: 3 },
    grantUpgrade: 'armor',
    requireLevel: 0,
  },
};

// Direkta köp - resurser man kan köpa direkt med guld
export const BUYABLES = {
  arrows: { label: '🏹 Pil', price: 6 },
  berry: { label: '🫐 Bär', price: 4 },
  cookedMeat: { label: '🍖 Tillagat kött', price: 18 },
};

export class Upgrades {
  constructor() {
    this.levels = {
      axe: 0,
      rod: 0,
      backpack: 0,
      boots: 0,
      sword: 0,
      bow: 0,
      shield: 0,
      armor: 0,
    };
    this.knownSpells = ['fireball', 'iceball', 'lightning'];
    this.equippedSpells = ['fireball', 'lightning'];
  }

  isSpellKnown(key) {
    return this.knownSpells.includes(key);
  }

  isSpellEquipped(key) {
    return this.equippedSpells.includes(key);
  }

  getEquippedSpell(slot) {
    return this.equippedSpells[slot] || null;
  }

  equipSpell(slot, key) {
    if (slot < 0 || slot > 1) return false;
    if (key && !this.knownSpells.includes(key)) return false;
    this.equippedSpells[slot] = key;
    return true;
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

  hasWeapon(key) {
    return this.levels[key] > 0;
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

  getSwordDamage() {
    return UPGRADES.sword.damage(this.levels.sword);
  }

  getBowDamage() {
    return UPGRADES.bow.damage(this.levels.bow);
  }

  getBowRange() {
    return UPGRADES.bow.range(this.levels.bow);
  }

  getShieldDefense() {
    return UPGRADES.shield.defense(this.levels.shield);
  }

  getArmorDefense() {
    return UPGRADES.armor.defense(this.levels.armor);
  }

  getDefense() {
    return this.getShieldDefense() + this.getArmorDefense();
  }

  grantUpgrade(key) {
    if (!UPGRADES[key]) return false;
    if (this.levels[key] >= UPGRADES[key].maxLevel) return false;
    this.levels[key] = Math.max(this.levels[key], 1);
    return true;
  }
}
