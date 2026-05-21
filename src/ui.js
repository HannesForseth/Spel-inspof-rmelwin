import { RECIPES, BUYABLES } from './upgrades.js';
import { MATERIAL_TYPES } from './inventory.js';
import { CharacterPreview } from './characterPreview.js';

const ITEM_LABELS = {
  wood: '🪵 Trä',
  berry: '🫐 Bär',
  fish: '🐟 Fisk',
  hide: '🟫 Skinn',
  meat: '🥩 Kött',
  cookedMeat: '🍖 Tillagat',
  arrows: '🏹 Pilar',
};

export class UI {
  constructor(game) {
    this.game = game;

    this.woodEl = document.getElementById('wood-count');
    this.berryEl = document.getElementById('berry-count');
    this.fishEl = document.getElementById('fish-count');
    this.hideEl = document.getElementById('hide-count');
    this.meatEl = document.getElementById('meat-count');
    this.cookedEl = document.getElementById('cooked-count');
    this.arrowEl = document.getElementById('arrow-count');
    this.totalEl = document.getElementById('total-count');
    this.capacityEl = document.getElementById('capacity');
    this.goldEl = document.getElementById('gold-count');

    this.hpTextEl = document.getElementById('hp-text');
    this.hpFillEl = document.getElementById('hp-fill');
    this.manaTextEl = document.getElementById('mana-text');
    this.manaFillEl = document.getElementById('mana-fill');
    this.breathLabelEl = document.getElementById('breath-label');
    this.breathBarEl = document.getElementById('breath-bar');
    this.breathTextEl = document.getElementById('breath-text');
    this.breathFillEl = document.getElementById('breath-fill');

    this.charPanelEl = document.getElementById('character-panel');
    this.charContentEl = document.getElementById('char-content');
    this.closeCharEl = document.getElementById('close-character');
    this.characterOpen = false;
    this.closeCharEl.addEventListener('click', () => this.toggleCharacterPanel());

    this.bagPanelEl = document.getElementById('bag-panel');
    this.bagContentEl = document.getElementById('bag-content');
    this.closeBagEl = document.getElementById('close-bag');
    this.bagOpen = false;
    this.closeBagEl.addEventListener('click', () => this.toggleBag());

    this.timeLabelEl = document.getElementById('time-label');

    this.weaponSlots = document.querySelectorAll('.weapon-slot');

    this.promptEl = document.getElementById('interact-prompt');
    this.progressEl = document.getElementById('progress-bar');
    this.progressFillEl = document.getElementById('progress-fill');
    this.shopEl = document.getElementById('shop');
    this.shopContentEl = document.getElementById('shop-content');
    this.closeShopEl = document.getElementById('close-shop');
    this.toastEl = document.getElementById('toast');
    this.damageFlashEl = document.getElementById('damage-flash');
    this.damageFlashTimer = null;
    this.shopTabs = document.querySelectorAll('.tab');

    this.shopOpen = false;
    this.activeTab = 'sell';
    this.toastTimer = null;

    this.closeShopEl.addEventListener('click', () => this.closeShop());

    this.shopTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.shopTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.dataset.tab;
        this.renderShop();
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.shopOpen) this.closeShop();
    });

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
    this.arrowEl.textContent = inventory.arrows;
    this.totalEl.textContent = inventory.total();
    this.capacityEl.textContent = inventory.capacity;
    this.goldEl.textContent = inventory.gold;

    if (player) {
      const pct = (player.hp / player.maxHp) * 100;
      this.hpFillEl.style.width = pct + '%';
      this.hpTextEl.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;

      if (this.manaFillEl) {
        const mp = (player.mana / player.maxMana) * 100;
        this.manaFillEl.style.width = mp + '%';
        this.manaTextEl.textContent = `${Math.ceil(player.mana)}/${player.maxMana}`;
      }

      // Andningsmätare - visa när man inte har full andning
      if (player.breath < player.maxBreath - 0.01) {
        this.breathLabelEl.classList.remove('hidden');
        this.breathBarEl.classList.remove('hidden');
        const bp = (player.breath / player.maxBreath) * 100;
        this.breathFillEl.style.width = bp + '%';
        this.breathTextEl.textContent = `${player.breath.toFixed(1)}/${player.maxBreath}`;
      } else {
        this.breathLabelEl.classList.add('hidden');
        this.breathBarEl.classList.add('hidden');
      }
    }

    if (timeLabel) this.timeLabelEl.textContent = timeLabel;

    this.weaponSlots.forEach((slot) => {
      const w = slot.dataset.weapon;
      slot.classList.toggle('owned', upgrades.hasWeapon(w));
      slot.classList.toggle('active', activeWeapon === w);
    });

    if (nearest && !this.shopOpen) {
      let msg;
      if (nearest.actionType === 'trade') {
        msg = `Tryck <b>E</b> för att prata med ${nearest.label}`;
      } else if (nearest.actionType === 'cook') {
        if (inventory.meat > 0) {
          msg = `Håll <b>E</b> för att laga kött på elden`;
        } else {
          msg = `Behöver rått kött för att laga`;
        }
      } else if (inventory.isFull()) {
        msg = 'Ryggsäcken är full! Sälj hos köpmannen';
      } else {
        msg = `Håll <b>E</b> för att ${nearest.actionLabel.toLowerCase()} ${nearest.label}`;
      }
      this.promptEl.innerHTML = msg;
      this.promptEl.classList.add('visible');
    } else {
      this.promptEl.classList.remove('visible');
    }

    if (interactingWith && interactingWith.actionType !== 'trade' && progress > 0) {
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

  toggleCharacterPanel() {
    this.characterOpen = !this.characterOpen;
    this.charPanelEl.classList.toggle('hidden', !this.characterOpen);
    if (this.characterOpen) {
      this.renderCharacterPanel();
      this._ensurePreview();
      this.preview?.start();
    } else {
      this.preview?.stop();
    }
    if (this.characterOpen && this.bagOpen) this.toggleBag();
  }

  _ensurePreview() {
    if (this.preview) return;
    const canvas = document.getElementById('char-preview-canvas');
    if (!canvas) return;
    this.preview = new CharacterPreview(
      canvas,
      this.game.upgrades,
      this.game.player,
    );
  }

  toggleBag() {
    this.bagOpen = !this.bagOpen;
    this.bagPanelEl.classList.toggle('hidden', !this.bagOpen);
    if (this.bagOpen) this.renderBag();
    if (this.bagOpen && this.characterOpen) this.toggleCharacterPanel();
  }

  renderBag() {
    const inv = this.game.inventory;
    const upg = this.game.upgrades;
    const eq = this.game.player.equipped;

    const heal = { berry: 10, meat: 8, cookedMeat: 40, fish: 15 };

    const equipment = [
      { key: 'sword', icon: '⚔️', label: 'Svärd' },
      { key: 'bow', icon: '🏹', label: 'Pilbåge' },
      { key: 'shield', icon: '🛡️', label: 'Sköld' },
      { key: 'armor', icon: '🥋', label: 'Rustning' },
    ];
    const materials = [
      { key: 'wood', icon: '🪵', label: 'Trä' },
      { key: 'hide', icon: '🟫', label: 'Skinn' },
      { key: 'berry', icon: '🫐', label: 'Bär' },
      { key: 'fish', icon: '🐟', label: 'Fisk' },
      { key: 'meat', icon: '🥩', label: 'Kött' },
      { key: 'cookedMeat', icon: '🍖', label: 'Tillagat' },
      { key: 'arrows', icon: '🏹', label: 'Pilar' },
    ];

    let html = `<p class="bag-summary">🎒 ${inv.total()} / ${inv.capacity} · 💰 ${inv.gold} guld</p>`;

    const owned = equipment.filter((e) => upg.getLevel(e.key) > 0);
    if (owned.length > 0) {
      html += `<h3 style="margin: 8px 0 6px; font-size: 14px; opacity: 0.85;">⚔️ Utrustning</h3>`;
      html += `<div class="bag-grid">`;
      for (const e of owned) {
        const level = upg.getLevel(e.key);
        const isEq = !!eq[e.key];
        html += `<div class="bag-slot ${isEq ? 'equipped' : ''}">
          <div class="bag-icon">${e.icon}</div>
          <div class="bag-label">${e.label} <span style="opacity:0.7">⭐${level}</span></div>
          <div class="bag-count" style="font-size:11px;font-weight:500;opacity:0.85">${isEq ? '✅ Equipped' : 'I bagen'}</div>
          <div class="bag-actions">
            <button class="bag-btn ${isEq ? 'drop-all' : 'eat'}" data-action="toggle-equip" data-item="${e.key}">
              ${isEq ? '⬇️ Ta av' : '⬆️ Ta på'}
            </button>
          </div>
        </div>`;
      }
      html += `</div>`;
    }

    html += `<h3 style="margin: 12px 0 6px; font-size: 14px; opacity: 0.85;">📦 Material</h3>`;
    html += `<div class="bag-grid">`;
    for (const s of materials) {
      const count = inv[s.key];
      const empty = count <= 0;
      const canEat = heal[s.key] != null && !empty;
      html += `<div class="bag-slot ${empty ? 'empty' : ''}">
        <div class="bag-icon">${s.icon}</div>
        <div class="bag-label">${s.label}</div>
        <div class="bag-count">${count}</div>
        <div class="bag-actions">
          ${canEat ? `<button class="bag-btn eat" data-action="eat" data-item="${s.key}">🍴 +${heal[s.key]}</button>` : ''}
          ${empty ? '' : `<button class="bag-btn drop" data-action="drop" data-item="${s.key}">🗑️ 1</button>`}
          ${count > 1 ? `<button class="bag-btn drop-all" data-action="drop-all" data-item="${s.key}">🗑️ alla</button>` : ''}
        </div>
      </div>`;
    }
    html += `</div>`;

    this.bagContentEl.innerHTML = html;
    this.bagContentEl.querySelectorAll('.bag-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const item = btn.dataset.item;
        this._bagAction(action, item, heal);
        this.renderBag();
      });
    });
  }

  _bagAction(action, item, heal) {
    const inv = this.game.inventory;
    const eq = this.game.player.equipped;
    if (action === 'toggle-equip' && eq[item] !== undefined) {
      eq[item] = !eq[item];
      if (eq[item] && (item === 'sword' || item === 'bow')) {
        this.game.controls.selectedWeapon = item;
      }
      this.showToast(eq[item] ? `⬆️ ${item} på` : `⬇️ ${item} av`);
      return;
    }
    if (action === 'eat' && heal[item] && inv[item] > 0) {
      inv[item] -= 1;
      const healed = this.game.player.heal(heal[item]);
      this.showToast(`🍴 +${healed} ❤️`);
    } else if (action === 'drop' && inv[item] > 0) {
      inv[item] -= 1;
      this.showToast(`🗑️ Slängde 1× ${item}`);
    } else if (action === 'drop-all' && inv[item] > 0) {
      const n = inv[item];
      inv[item] = 0;
      this.showToast(`🗑️ Slängde ${n}× ${item}`);
    }
  }

  renderCharacterPanel() {
    const player = this.game.player;
    const inv = this.game.inventory;
    const upg = this.game.upgrades;

    let html = `
      <div class="char-preview-wrap">
        <canvas id="char-preview-canvas" width="300" height="260"></canvas>
      </div>
      <h3>Stats</h3>`;
    html += `<div class="stat-row"><span>❤️ Hälsa</span><b>${Math.ceil(player.hp)} / ${player.maxHp}</b></div>`;
    html += `<div class="stat-row"><span>💨 Andning</span><b>${player.breath.toFixed(1)} / ${player.maxBreath}</b></div>`;
    html += `<div class="stat-row"><span>⚔️ Svärdsskada</span><b>${upg.getSwordDamage()}</b></div>`;
    html += `<div class="stat-row"><span>🏹 Bågskada</span><b>${upg.getBowDamage()}</b></div>`;
    html += `<div class="stat-row"><span>🛡️ Försvar</span><b>${upg.getDefense(player.equipped)}</b></div>`;
    html += `<div class="stat-row"><span>🏃 Hastighet</span><b>${upg.getMoveSpeed().toFixed(1)} m/s</b></div>`;
    html += `<div class="stat-row"><span>🎒 Ryggsäck</span><b>${inv.total()} / ${inv.capacity}</b></div>`;
    html += `<div class="stat-row"><span>💰 Guld</span><b>${inv.gold}</b></div>`;

    html += `<h3>Utrustning</h3>`;
    const slotHTML = (key, icon, fallback) => {
      const owned = upg.getLevel(key) > 0;
      const lvl = upg.getLevel(key);
      return `<div class="equipment-slot ${owned ? 'filled' : ''}">
        <div class="icon">${icon}</div>
        ${owned ? `${fallback} ⭐${lvl}` : fallback}
      </div>`;
    };
    html += `<div class="equipment-grid">
      ${slotHTML('sword', '⚔️', 'Svärd')}
      ${slotHTML('bow', '🏹', 'Pilbåge')}
      ${slotHTML('shield', '🛡️', 'Sköld')}
      ${slotHTML('armor', '🥋', 'Rustning')}
      ${slotHTML('axe', '🪓', 'Yxa')}
      ${slotHTML('rod', '🎣', 'Metspö')}
      ${slotHTML('boots', '👟', 'Skor')}
      ${slotHTML('backpack', '🎒', 'Ryggsäck')}
    </div>`;

    html += `<p style="font-size: 12px; opacity: 0.7; margin-top: 10px;">
      💡 Saknar grundvapen? Gå till smedjan och välj "🔨 Tillverka".
    </p>`;

    html += `<h3>Uppgraderingar</h3>`;
    for (const key of upg.getAllKeys()) {
      const def = upg.getDefinition(key);
      const lvl = upg.getLevel(key);
      const stars = '★'.repeat(lvl) + '☆'.repeat(def.maxLevel - lvl);
      html += `<div class="stat-row"><span>${def.label}</span><b>${stars}</b></div>`;
    }

    this.charContentEl.innerHTML = html;
  }

  flashDamage() {
    this.damageFlashEl.classList.add('visible');
    clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = setTimeout(() => {
      this.damageFlashEl.classList.remove('visible');
    }, 180);
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
    switch (this.activeTab) {
      case 'sell':
        this._renderSell();
        break;
      case 'buy':
        this._renderBuy();
        break;
      case 'upgrade':
        this._renderUpgrade();
        break;
      case 'craft':
        this._renderCraft();
        break;
    }
  }

  _renderSell() {
    const inv = this.game.inventory;
    const prices = inv.getPrices();
    let html = `<p style="opacity: 0.7; font-size: 13px; margin-bottom: 8px;">Sälj resurser separat. Mat behåller du för att kunna äta.</p>`;

    // Säljbara material först
    for (const type of MATERIAL_TYPES) {
      const count = inv[type];
      const price = prices[type];
      html += `<div class="shop-item">
        <div class="info">
          <div><b>${ITEM_LABELS[type]}</b></div>
          <div class="sub">${count} st · ${price} 💰 styck · ${count * price} 💰 totalt</div>
        </div>
        <button data-sell="${type}" ${count === 0 ? 'disabled' : ''}>Sälj alla</button>
      </div>`;
    }

    // Mat - visa men inte sälja-knapp (eller med varning)
    html += `<h3 style="margin-top: 14px;">Mat (kan säljas men då tappar du läkning)</h3>`;
    for (const type of ['berry', 'fish', 'meat', 'cookedMeat']) {
      const count = inv[type];
      const price = prices[type];
      html += `<div class="shop-item">
        <div class="info">
          <div><b>${ITEM_LABELS[type]}</b></div>
          <div class="sub">${count} st · ${price} 💰 styck</div>
        </div>
        <button data-sell="${type}" ${count === 0 ? 'disabled' : ''} style="background: #ff9800;">Sälj alla</button>
      </div>`;
    }

    this.shopContentEl.innerHTML = html;
    this.shopContentEl.querySelectorAll('button[data-sell]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.sell;
        const earned = inv.sellAllOf(type);
        if (earned > 0) {
          this.showToast(`+${earned} 💰`);
          this.renderShop();
        }
      });
    });
  }

  _renderBuy() {
    const inv = this.game.inventory;
    let html = `<p style="opacity: 0.7; font-size: 13px; margin-bottom: 8px;">Köp resurser direkt om du behöver dem snabbt.</p>`;

    for (const key of Object.keys(BUYABLES)) {
      const item = BUYABLES[key];
      const canAfford = inv.gold >= item.price;
      const owned = inv[key] || 0;
      html += `<div class="shop-item">
        <div class="info">
          <div><b>${item.label}</b></div>
          <div class="sub">Pris: ${item.price} 💰 · Du har: ${owned}</div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <input class="qty-input" type="number" min="1" max="99" value="1" data-buy-qty="${key}" />
          <button data-buy="${key}" ${canAfford ? '' : 'disabled'}>Köp</button>
        </div>
      </div>`;
    }

    this.shopContentEl.innerHTML = html;
    this.shopContentEl.querySelectorAll('button[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.buy;
        const qtyInput = this.shopContentEl.querySelector(`input[data-buy-qty="${key}"]`);
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        this._buy(key, qty);
        this.renderShop();
      });
    });
  }

  _buy(key, qty) {
    const inv = this.game.inventory;
    const item = BUYABLES[key];
    const totalCost = item.price * qty;
    if (inv.gold < totalCost) {
      this.showToast('💸 Inte tillräckligt med guld!');
      return;
    }
    // Kapacitet-check (utom för pilar)
    if (key !== 'arrows') {
      if (inv.total() + qty > inv.capacity) {
        this.showToast('🎒 Ryggsäcken är inte stor nog!');
        return;
      }
    }
    inv.gold -= totalCost;
    inv[key] += qty;
    this.showToast(`Köpte ${qty}× ${item.label}`);
  }

  _renderUpgrade() {
    const inv = this.game.inventory;
    const upg = this.game.upgrades;
    let html = `<p style="opacity: 0.7; font-size: 13px; margin-bottom: 8px;">Förbättra dina verktyg och vapen vid städet.</p>`;

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
    this.shopContentEl.querySelectorAll('button[data-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.upgrade;
        const wasOwned = upg.getLevel(key) > 0;
        if (upg.buy(key, inv)) {
          this.showToast(`${upg.getDefinition(key).label} ${upg.getLevel(key)}!`);
          // Auto-equippa vid första köpet (level 0 → 1)
          if (!wasOwned && key in this.game.player.equipped) {
            this.game.player.equipped[key] = true;
          }
          if ((key === 'sword' || key === 'bow') && upg.getLevel(key) === 1) {
            this.game.controls.selectedWeapon = key;
          }
          this.renderShop();
        }
      });
    });
  }

  _renderCraft() {
    const inv = this.game.inventory;
    const upg = this.game.upgrades;
    let html = `<p style="opacity: 0.7; font-size: 13px; margin-bottom: 8px;">Tillverka saker från råmaterial. Smart om du har resurserna.</p>`;

    for (const key of Object.keys(RECIPES)) {
      const recipe = RECIPES[key];

      if (recipe.grantUpgrade && upg.getLevel(recipe.grantUpgrade) > (recipe.requireLevel ?? 0)) {
        continue;
      }

      const inputStr = Object.entries(recipe.input)
        .map(([t, n]) => `${n}× ${ITEM_LABELS[t] || t}`)
        .join(', ');
      const outputStr = recipe.grantUpgrade
        ? `🎁 ${recipe.label.split(' ').slice(1).join(' ')} (nivå 1)`
        : Object.entries(recipe.output)
            .map(([t, n]) => `${n}× ${ITEM_LABELS[t] || t}`)
            .join(', ');

      const canCraft = Object.entries(recipe.input).every(([t, n]) => inv[t] >= n);
      const showQty = !recipe.grantUpgrade;

      html += `<div class="shop-item">
        <div class="info">
          <div><b>${recipe.label}</b></div>
          <div class="sub">${recipe.description}</div>
          <div class="sub">Behöver: ${inputStr} → Får: ${outputStr}</div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${showQty ? `<input class="qty-input" type="number" min="1" max="99" value="1" data-craft-qty="${key}" />` : ''}
          <button data-craft="${key}" ${canCraft ? '' : 'disabled'}>Tillverka</button>
        </div>
      </div>`;
    }

    this.shopContentEl.innerHTML = html;
    this.shopContentEl.querySelectorAll('button[data-craft]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.craft;
        const qtyInput = this.shopContentEl.querySelector(`input[data-craft-qty="${key}"]`);
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        this._craft(key, qty);
        this.renderShop();
      });
    });
  }

  _craft(key, qty) {
    const inv = this.game.inventory;
    const recipe = RECIPES[key];

    if (recipe.grantUpgrade) qty = 1;

    for (const [type, n] of Object.entries(recipe.input)) {
      if (inv[type] < n * qty) {
        this.showToast(`Behöver ${n * qty}× ${ITEM_LABELS[type] || type}`);
        return;
      }
    }
    for (const [type, n] of Object.entries(recipe.input)) {
      inv[type] -= n * qty;
    }

    if (recipe.grantUpgrade) {
      const ok = this.game.upgrades.grantUpgrade(recipe.grantUpgrade);
      if (ok) {
        const k = recipe.grantUpgrade;
        if (this.game.player.equipped[k] !== undefined) {
          this.game.player.equipped[k] = true;
        }
        if (k === 'sword' || k === 'bow') {
          this.game.controls.selectedWeapon = k;
        }
      }
      this.showToast(`🎉 Tillverkade ${recipe.label}!`);
    } else {
      for (const [type, n] of Object.entries(recipe.output)) {
        inv[type] += n * qty;
      }
      this.showToast(`Tillverkade ${qty}× ${recipe.label}!`);
    }
  }
}
