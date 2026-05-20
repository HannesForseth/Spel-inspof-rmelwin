import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const SUPABASE_URL = 'https://starimrzglxcgxiklfzw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7evNY5nppn4vmg1x75kPEQ_RJ6EgfGG';
const PORT = process.env.PORT || 3000;

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
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.get('/', (req, res) => {
  res.send('🌲 Skogens Skördare — multiplayer-server kör.');
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    players: io.engine.clientsCount,
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
  console.log(
    `[+] ${username} (${userId.slice(0, 8)}) ansluten — totalt ${io.engine.clientsCount}`,
  );

  socket.emit('welcome', {
    userId,
    username,
    onlineCount: io.engine.clientsCount,
  });

  socket.broadcast.emit('player:joined', { userId, username });

  socket.on('disconnect', (reason) => {
    console.log(`[-] ${username} kopplade ner (${reason})`);
    socket.broadcast.emit('player:left', { userId });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server lyssnar på port ${PORT}`);
});
