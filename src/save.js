const KEY = 'skogens-skordare-v2';

export class Save {
  save(inventory, upgrades, player, controls) {
    const data = {
      inventory: {
        wood: inventory.wood,
        berry: inventory.berry,
        fish: inventory.fish,
        hide: inventory.hide,
        meat: inventory.meat,
        cookedMeat: inventory.cookedMeat,
        arrows: inventory.arrows,
        gold: inventory.gold,
        capacity: inventory.capacity,
      },
      upgrades: { ...upgrades.levels },
      equipped: { ...player.equipped },
      player: {
        x: player.position.x,
        z: player.position.z,
        hp: player.hp,
      },
      selectedWeapon: controls ? controls.selectedWeapon : null,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Kunde inte spara:', e);
    }
  }

  load(inventory, upgrades, player, controls) {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.inventory) Object.assign(inventory, data.inventory);
      if (data.upgrades) Object.assign(upgrades.levels, data.upgrades);
      inventory.capacity = upgrades.getCapacity();
      if (data.equipped) {
        Object.assign(player.equipped, data.equipped);
      } else {
        // Äldre save utan equipped-state: equippa allt man äger
        for (const key of ['sword', 'bow', 'shield', 'armor']) {
          if (upgrades.levels[key] > 0 && key in player.equipped) {
            player.equipped[key] = true;
          }
        }
      }
      if (data.player) {
        player.position.x = data.player.x;
        player.position.z = data.player.z;
        if (typeof data.player.hp === 'number') player.hp = data.player.hp;
        player.group.position.copy(player.position);
      }
      if (data.selectedWeapon && controls) {
        controls.selectedWeapon = data.selectedWeapon;
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
