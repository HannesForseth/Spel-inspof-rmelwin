const KEY = 'skogens-skordare-v1';

export class Save {
  save(inventory, upgrades, player) {
    const data = {
      inventory: {
        wood: inventory.wood,
        berry: inventory.berry,
        fish: inventory.fish,
        gold: inventory.gold,
        capacity: inventory.capacity,
      },
      upgrades: { ...upgrades.levels },
      player: { x: player.position.x, z: player.position.z },
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Kunde inte spara:', e);
    }
  }

  load(inventory, upgrades, player) {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.inventory) Object.assign(inventory, data.inventory);
      if (data.upgrades) Object.assign(upgrades.levels, data.upgrades);
      inventory.capacity = upgrades.getCapacity();
      if (data.player) {
        player.position.x = data.player.x;
        player.position.z = data.player.z;
        player.group.position.copy(player.position);
      }
      return true;
    } catch (e) {
      console.warn('Kunde inte ladda:', e);
      return false;
    }
  }

  reset() {
    localStorage.removeItem(KEY);
  }
}
