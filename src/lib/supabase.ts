/**
 * Supabase browser client — uses @supabase/ssr for HttpOnly cookie sessions.
 * Requires Next.js middleware (src/middleware.ts) for cookie refresh.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Return a mock client during build / when env vars aren't set
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ data: { session: null, user: null }, error: { message: 'Supabase not configured' } }),
        signUp: async () => ({ data: { session: null, user: null }, error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null }),
        exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error: { message: 'Supabase not configured' } }),
      },
    } as unknown as SupabaseClient;
  }

  client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
