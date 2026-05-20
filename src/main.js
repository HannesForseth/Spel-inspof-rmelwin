import { Game } from './game.js';
import { getSession, getUsernameFromUser, logout, onAuthChange } from './auth.js';
import { showLoginScreen } from './loginScreen.js';

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
    <button id="user-logout" type="button">Logga ut</button>
  `;
  hud.querySelector('#user-logout').addEventListener('click', async () => {
    await logout();
    location.reload();
  });
}

onAuthChange((session, event) => {
  if (event === 'SIGNED_OUT') {
    location.reload();
  }
});

boot();
