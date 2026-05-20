import { Game } from './game.js';

const container = document.getElementById('game-container');
const game = new Game(container);
game.start();

// Lite globalt om Melwin vill leka i konsolen
window.game = game;
