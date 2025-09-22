import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

function ensureSupabaseUrl() {
  if (!SUPABASE_URL) {
    throw new Error("Supabase URL is not configured");
  }

  return SUPABASE_URL;
}

function ensureAnonKey() {
  if (!process.env.SUPABASE_ANON_KEY) {
    throw new Error("Supabase anon key is not configured");
  }

  return process.env.SUPABASE_ANON_KEY;
}

export function getServiceRoleClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role key is not configured");
  }

  return createClient<Database>(ensureSupabaseUrl(), SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });
}

export function getPublicClient() {
  return createClient<Database>(ensureSupabaseUrl(), ensureAnonKey(), {
    auth: {
      persistSession: false,
    },
  });
}

function createSupabaseServerClient() {
  const supabaseUrl = ensureSupabaseUrl();
  const supabaseAnonKey = ensureAnonKey();
  const cookieStore = cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
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

export function getRouteHandlerClient() {
  return createSupabaseServerClient();
}

export function getServerComponentClient() {
  return createSupabaseServerClient();
}

export function getServerActionClient() {
  return createSupabaseServerClient();
}

export function getServerAuthClient() {
  return createSupabaseServerClient();
}
