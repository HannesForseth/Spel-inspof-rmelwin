import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://starimrzglxcgxiklfzw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7evNY5nppn4vmg1x75kPEQ_RJ6EgfGG';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'skogensskordare.auth',
  },
});
