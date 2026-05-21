import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const SUPABASE_URL = 'https://starimrzglxcgxiklfzw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7evNY5nppn4vmg1x75kPEQ_RJ6EgfGG';
const PORT = process.env.PORT || 3000;

const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
const STALE_MS = 10_000;

async function getUserFromToken(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  return await res.json();
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const players = new Map();

app.get('/', (req, res) => {
  res.send('🌲 Skogens Skördare — multiplayer-server kör.');
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    players: players.size,
    sockets: io.engine.clientsCount,
    uptime: process.uptime(),
  });
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Ingen access-token'));

  try {
    const user = await getUserFromToken(token);
    if (!user || !user.id) return next(new Error('Ogiltig token'));

    socket.data.userId = user.id;
    socket.data.username =
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      'okänd';
    next();
  } catch (err) {
    next(new Error('Auth-fel: ' + err.message));
  }
});

io.on('connection', (socket) => {
  const { userId, username } = socket.data;

  players.set(userId, {
    userId,
    username,
    x: 0,
    y: 0,
    z: 0,
    facing: 0,
    action: 'idle',
    weapon: null,
    hp: 100,
    lastSeen: Date.now(),
  });

  console.log(
    `[+] ${username} (${userId.slice(0, 8)}) ansluten — totalt ${players.size}`,
  );

  socket.emit('welcome', {
    userId,
    username,
    onlineCount: players.size,
    players: Array.from(players.values()),
  });

  socket.broadcast.emit('player:joined', { userId, username });

  socket.on('player:input', (data) => {
    const p = players.get(userId);
    if (!p) return;
    if (typeof data?.x === 'number') p.x = data.x;
    if (typeof data?.y === 'number') p.y = data.y;
    if (typeof data?.z === 'number') p.z = data.z;
    if (typeof data?.facing === 'number') p.facing = data.facing;
    if (typeof data?.action === 'string') p.action = data.action;
    if (typeof data?.weapon === 'string' || data?.weapon === null) p.weapon = data.weapon;
    if (typeof data?.hp === 'number') p.hp = data.hp;
    p.lastSeen = Date.now();
  });

  socket.on('chat:message', (text) => {
    if (typeof text !== 'string') return;
    const clean = text.trim().slice(0, 200);
    if (!clean) return;
    io.emit('chat:message', { userId, username, text: clean, t: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    players.delete(userId);
    console.log(
      `[-] ${username} kopplade ner (${reason}) — kvar ${players.size}`,
    );
    socket.broadcast.emit('player:left', { userId });
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, p] of players) {
    if (now - p.lastSeen > STALE_MS) {
      players.delete(id);
      io.emit('player:left', { userId: id });
    }
  }
  if (players.size === 0) return;
  io.emit('world:state', {
    t: now,
    players: Array.from(players.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
      x: p.x,
      y: p.y,
      z: p.z,
      facing: p.facing,
      action: p.action,
      weapon: p.weapon,
      hp: p.hp,
    })),
  });
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`Server lyssnar på port ${PORT}`);
});
