import { supabase } from './supa.js';

const EMAIL_DOMAIN = 'skogensskordare.local';
const LAST_USERNAME_KEY = 'skogensskordare.lastUsername';

const USERNAME_RE = /^[a-zA-Z0-9_-]{2,20}$/;

function usernameToEmail(username) {
  return `${username.toLowerCase()}@${EMAIL_DOMAIN}`;
}

function emailToUsername(email) {
  if (!email) return null;
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function validateUsername(username) {
  if (!username) return 'Användarnamn krävs';
  if (!USERNAME_RE.test(username)) {
    return 'Endast bokstäver, siffror, _ och - (2-20 tecken)';
  }
  return null;
}

export function validatePassword(password) {
  if (!password) return 'Lösenord krävs';
  if (password.length < 6) return 'Minst 6 tecken';
  return null;
}

export async function register(username, password) {
  const uErr = validateUsername(username);
  if (uErr) return { error: uErr };
  const pErr = validatePassword(password);
  if (pErr) return { error: pErr };

  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: username.toLowerCase() } },
  });
  if (error) {
    if (error.message?.toLowerCase().includes('already')) {
      return { error: 'Användarnamnet är upptaget' };
    }
    return { error: error.message };
  }
  if (data.session) {
    localStorage.setItem(LAST_USERNAME_KEY, username.toLowerCase());
  }
  return { user: data.user, session: data.session };
}

export async function login(username, password) {
  const uErr = validateUsername(username);
  if (uErr) return { error: uErr };
  if (!password) return { error: 'Lösenord krävs' };

  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message?.toLowerCase().includes('invalid')) {
      return { error: 'Fel användarnamn eller lösenord' };
    }
    return { error: error.message };
  }
  localStorage.setItem(LAST_USERNAME_KEY, username.toLowerCase());
  return { user: data.user, session: data.session };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function getUsernameFromUser(user) {
  if (!user) return null;
  return user.user_metadata?.username ?? emailToUsername(user.email);
}

export function getLastUsername() {
  return localStorage.getItem(LAST_USERNAME_KEY) ?? '';
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session ?? null, event);
  });
  return () => data.subscription.unsubscribe();
}
