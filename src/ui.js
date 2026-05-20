export class UI {
  constructor(game) {
    this.game = game;

    // Resurs-räknare
    this.woodEl = document.getElementById('wood-count');
    this.berryEl = document.getElementById('berry-count');
    this.fishEl = document.getElementById('fish-count');
    this.hideEl = document.getElementById('hide-count');
    this.meatEl = document.getElementById('meat-count');
    this.cookedEl = document.getElementById('cooked-count');
    this.totalEl = document.getElementById('total-count');
    this.capacityEl = document.getElementById('capacity');
    this.goldEl = document.getElementById('gold-count');

    // HP
    this.hpTextEl = document.getElementById('hp-text');
    this.hpFillEl = document.getElementById('hp-fill');

    // Tid på dygnet
    this.timeLabelEl = document.getElementById('time-label');

    // Vapen
    this.weaponSlots = document.querySelectorAll('.weapon-slot');

    // Övriga
    this.promptEl = document.getElementById('interact-prompt');
    this.progressEl = document.getElementById('progress-bar');
    this.progressFillEl = document.getElementById('progress-fill');
    this.shopEl = document.getElementById('shop');
    this.shopContentEl = document.getElementById('shop-content');
    this.shopButtonEl = document.getElementById('shop-button');
    this.closeShopEl = document.getElementById('close-shop');
    this.toastEl = document.getElementById('toast');

    this.shopOpen = false;
    this.toastTimer = null;

    this.shopButtonEl.addEventListener('click', () => this.openShop());
    this.closeShopEl.addEventListener('click', () => this.closeShop());

    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'b') {
        if (this.shopOpen) this.closeShop();
        else this.openShop();
      }
      if (e.key === 'Escape' && this.shopOpen) this.closeShop();
    });

    // Klick på vapen-slot för att välja
    this.weaponSlots.forEach((slot) => {
      slot.addEventListener('click', () => {
        const w = slot.dataset.weapon;
        if (this.game.upgrades.hasWeapon(w)) {
          this.game.controls.selectedWeapon = w;
        }
      });
      slot.style.pointerEvents = 'auto';
      slot.style.cursor = 'pointer';
    });
  }

  update({ nearest, interactingWith, progress, inventory, upgrades, player, timeLabel, activeWeapon }) {
    this.woodEl.textContent = inventory.wood;
    this.berryEl.textContent = inventory.berry;
    this.fishEl.textContent = inventory.fish;
    this.hideEl.textContent = inventory.hide;
    this.meatEl.textContent = inventory.meat;
    this.cookedEl.textContent = inventory.cookedMeat;
    this.totalEl.textContent = inventory.total();
    this.capacityEl.textContent = inventory.capacity;
    this.goldEl.textContent = inventory.gold;

    // HP-bar
    if (player) {
      const pct = (player.hp / player.maxHp) * 100;
      this.hpFillEl.style.width = pct + '%';
      this.hpTextEl.textContent = `${player.hp}/${player.maxHp}`;
    }

    // Tid
    if (timeLabel) this.timeLabelEl.textContent = timeLabel;

    // Vapen-HUD
    this.weaponSlots.forEach((slot) => {
      const w = slot.dataset.weapon;
      slot.classList.toggle('owned', upgrades.hasWeapon(w));
      slot.classList.toggle('active', activeWeapon === w);
    });

    // Interaktions-prompt
    if (nearest && !this.shopOpen) {
      let msg;
      if (nearest.actionType === 'cook') {
        if (inventory.meat > 0) {
          msg = `Håll <b>E</b> för att laga kött på elden`;
        } else {
          msg = `Behöver rått kött för att laga`;
        }
      } else if (inventory.isFull()) {
        msg = 'Ryggsäcken är full! Sälj i butiken (<b>B</b>)';
      } else {
        msg = `Håll <b>E</b> för att ${nearest.actionLabel.toLowerCase()} ${nearest.label}`;
      }
      this.promptEl.innerHTML = msg;
      this.promptEl.classList.add('visible');
    } else {
      this.promptEl.classList.remove('visible');
    }

    if (interactingWith && progress > 0) {
      this.progressEl.classList.add('visible');
      this.progressFillEl.style.width = `${Math.min(progress * 100, 100)}%`;
    } else {
      this.progressEl.classList.remove('visible');
    }
  }

  openShop() {
    this.shopOpen = true;
    this.shopEl.classList.remove('hidden');
    this.renderShop();
  }

  closeShop() {
    this.shopOpen = false;
    this.shopEl.classList.add('hidden');
  }

  showToast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2200);
  }

  renderShop() {
    const inv = this.game.inventory;
    const upg = this.game.upgrades;
    const prices = inv.getPrices();

    let html = '';

    html += `<h3>Sälj resurser</h3>`;
    html += `<div class="shop-item">
      <div class="info">
        <div>🪵 Trä: <b>${inv.wood}</b> × ${prices.wood} · 🫐 Bär: <b>${inv.berry}</b> × ${prices.berry}</div>
        <div>🐟 Fisk: <b>${inv.fish}</b> × ${prices.fish} · 🟫 Skinn: <b>${inv.hide}</b> × ${prices.hide}</div>
        <div>🥩 Kött: <b>${inv.meat}</b> × ${prices.meat} · 🍖 Tillagat: <b>${inv.cookedMeat}</b> × ${prices.cookedMeat}</div>
        <div class="sub">Totalt värde: <b style="color: gold;">${inv.getSellValue()} 💰</b></div>
      </div>
      <button id="sell-all-btn" ${inv.total() === 0 ? 'disabled' : ''}>Sälj allt</button>
    </div>`;

    html += `<h3>Uppgraderingar</h3>`;
    for (const key of upg.getAllKeys()) {
      const def = upg.getDefinition(key);
      const level = upg.getLevel(key);
      const isMaxed = upg.isMaxed(key);
      const cost = upg.getCost(key);
      const canAfford = !isMaxed && inv.gold >= cost;
      const stars = '★'.repeat(level) + '☆'.repeat(def.maxLevel - level);
      const buyLabel = isMaxed ? 'MAX' : level === 0 ? `Köp · ${cost} 💰` : `Uppgradera · ${cost} 💰`;

      html += `<div class="shop-item">
        <div class="info">
          <div><b>${def.label}</b> &nbsp;<span class="stars">${stars}</span></div>
          <div class="sub">${def.description}</div>
        </div>
        <button data-upgrade="${key}" ${isMaxed || !canAfford ? 'disabled' : ''}>${buyLabel}</button>
      </div>`;
    }

    this.shopContentEl.innerHTML = html;

    const sellBtn = document.getElementById('sell-all-btn');
    if (sellBtn) {
      sellBtn.addEventListener('click', () => {
        const earned = inv.sellAll();
        this.showToast(`+${earned} 💰`);
        this.renderShop();
      });
    }

    this.shopContentEl.querySelectorAll('button[data-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.upgrade;
        if (upg.buy(key, inv)) {
          this.showToast(`${upg.getDefinition(key).label} ${upg.getLevel(key)}!`);
          // Om man precis köpte ett vapen, välj det
          if ((key === 'sword' || key === 'bow') && upg.getLevel(key) === 1) {
            this.game.controls.selectedWeapon = key;
          }
          this.renderShop();
        }
      });
    });
  }
}
