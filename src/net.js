import { io } from 'socket.io-client';
import { supabase } from './supa.js';

const FALLBACK_URL = 'http://localhost:3000';

function resolveServerUrl() {
  const fromEnv = import.meta.env.VITE_WS_SERVER_URL;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.__WS_SERVER_URL__) {
    return window.__WS_SERVER_URL__;
  }
  return FALLBACK_URL;
}

class Net extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.connected = false;
    this.onlineCount = 0;
    this.players = new Map();
    this.me = null;
  }

  async connect() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      console.warn('[net] Ingen session — kan inte ansluta');
      return false;
    }

    const url = resolveServerUrl();
    console.log('[net] Ansluter till', url);

    this.socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._emit('status', { connected: true });
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this._emit('status', { connected: false, reason });
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[net] Anslutningsfel:', err.message);
      this._emit('status', { connected: false, error: err.message });
    });

    this.socket.on('welcome', (payload) => {
      this.me = { userId: payload.userId, username: payload.username };
      this.onlineCount = payload.onlineCount;
      this._emit('welcome', payload);
    });

    this.socket.on('player:joined', (payload) => {
      this.players.set(payload.userId, payload);
      this.onlineCount += 1;
      this._emit('player:joined', payload);
    });

    this.socket.on('player:left', (payload) => {
      this.players.delete(payload.userId);
      this.onlineCount = Math.max(0, this.onlineCount - 1);
      this._emit('player:left', payload);
    });

    return true;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.players.clear();
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export const net = new Net();
