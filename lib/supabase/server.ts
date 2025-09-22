// supabase.ts
import 'server-only'; // ensure this never gets bundled client-side

import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;

function ensureSupabaseUrl(): string {
  if (!SUPABASE_URL) throw new Error('Supabase URL is not configured');
  return SUPABASE_URL;
}

function ensureAnonKey(): string {
  if (!SUPABASE_ANON_KEY) throw new Error('Supabase anon key is not configured');
  return SUPABASE_ANON_KEY;
}

/**
 * Server-only client with the service role key.
 * NEVER import or call this from client components.
 */
export function getServiceRoleClient(): SupabaseClient<Database> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role key is not configured');
  }
  return createClient<Database>(ensureSupabaseUrl(), SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Public client for server usage (anon key, no cookies).
 * If you need auth session handling in RSC/route handlers, use getServerClient().
 */
export function getPublicServerClient(): SupabaseClient<Database> {
  return createClient<Database>(ensureSupabaseUrl(), ensureAnonKey(), {
    auth: { persistSession: false },
  });
}

/**
 * Server client (RSC/Route Handlers) with cookie bridging.
 * Use this for authenticated server reads/writes with the user's session.
 */
export function getServerClient(): SupabaseClient<Database> {
  const cookieStore = cookies();
  return createServerClient<Database>(ensureSupabaseUrl(), ensureAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

// Backwards-compatible aliases if you like:
export const getRouteHandlerClient = getServerClient;
export const getServerComponentClient = getServerClient;
export const getServerActionClient = getServerClient;
export const getServerAuthClient = getServerClient;
