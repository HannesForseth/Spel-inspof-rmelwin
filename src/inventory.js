import { PRICES } from './resources.js';

export class Inventory {
  constructor() {
    this.wood = 0;
    this.berry = 0;
    this.fish = 0;
    this.hide = 0;
    this.meat = 0;
    this.cookedMeat = 0;
    this.gold = 0;
    this.capacity = 10;
  }

  // Allt utom guld räknas mot kapacitet
  total() {
    return this.wood + this.berry + this.fish + this.hide + this.meat + this.cookedMeat;
  }

  isFull() {
    return this.total() >= this.capacity;
  }

  add(type, amount) {
    if (type === 'gold') {
      this.gold += amount;
      return true;
    }
    if (this.isFull()) return false;
    this[type] += amount;
    return true;
  }

  remove(type, amount) {
    if (this[type] < amount) return false;
    this[type] -= amount;
    return true;
  }

  getSellValue() {
    return (
      this.wood * PRICES.wood +
      this.berry * PRICES.berry +
      this.fish * PRICES.fish +
      this.hide * PRICES.hide +
      this.meat * PRICES.meat +
      this.cookedMeat * PRICES.cookedMeat
    );
  }

  sellAll() {
    const gold = this.getSellValue();
    this.gold += gold;
    this.wood = 0;
    this.berry = 0;
    this.fish = 0;
    this.hide = 0;
    this.meat = 0;
    this.cookedMeat = 0;
    return gold;
  }

  getPrices() {
    return PRICES;
  }
}
