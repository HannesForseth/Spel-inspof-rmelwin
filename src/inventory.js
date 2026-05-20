import { PRICES } from './resources.js';

export class Inventory {
  constructor() {
    this.wood = 0;
    this.berry = 0;
    this.fish = 0;
    this.gold = 0;
    this.capacity = 10;
  }

  total() {
    return this.wood + this.berry + this.fish;
  }

  isFull() {
    return this.total() >= this.capacity;
  }

  add(type, amount) {
    if (this.isFull()) return false;
    this[type] += amount;
    return true;
  }

  getSellValue() {
    return this.wood * PRICES.wood + this.berry * PRICES.berry + this.fish * PRICES.fish;
  }

  sellAll() {
    const gold = this.getSellValue();
    this.gold += gold;
    this.wood = 0;
    this.berry = 0;
    this.fish = 0;
    return gold;
  }

  getPrices() {
    return PRICES;
  }
}
