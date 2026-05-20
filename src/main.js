import { Game } from './game.js';
import { getSession, getUsernameFromUser, logout, onAuthChange } from './auth.js';
import { showLoginScreen } from './loginScreen.js';
import { net } from './net.js';

async function boot() {
  let session = await getSession();
  if (!session) {
    session = await showLoginScreen();
  }

  mountUserHud(session.user);

  const container = document.getElementById('game-container');
  const game = new Game(container);
  game.start();
  window.game = game;

  net.connect().then((ok) => {
    if (!ok) updateNetStatus('error');
  });

  net.addEventListener('status', (e) => {
    updateNetStatus(e.detail.connected ? 'online' : 'offline');
  });
  net.addEventListener('welcome', () => updateNetStatus('online'));
  net.addEventListener('player:joined', () => updateNetStatus('online'));
  net.addEventListener('player:left', () => updateNetStatus('online'));
}

function mountUserHud(user) {
  const username = getUsernameFromUser(user) ?? 'okänd';
  let hud = document.getElementById('user-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'user-hud';
    document.getElementById('ui').appendChild(hud);
  }
  hud.innerHTML = `
    <span class="user-name">👤 ${username}</span>
    <span id="net-status" class="net-status net-offline" title="Multiplayer-status">⚫ ansluter…</span>
    <button id="user-logout" type="button">Logga ut</button>
  `;
  hud.querySelector('#user-logout').addEventListener('click', async () => {
    net.disconnect();
    await logout();
    location.reload();
  });
}

function updateNetStatus(state) {
  const el = document.getElementById('net-status');
  if (!el) return;
  el.classList.remove('net-online', 'net-offline', 'net-error');
  if (state === 'online') {
    el.classList.add('net-online');
    el.textContent = `🟢 online · ${net.onlineCount}`;
  } else if (state === 'error') {
    el.classList.add('net-error');
    el.textContent = '🔴 offline';
  } else {
    el.classList.add('net-offline');
    el.textContent = '🟡 offline';
  }
}

onAuthChange((session, event) => {
  if (event === 'SIGNED_OUT') {
    location.reload();
  }
});

boot();
