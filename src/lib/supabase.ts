import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let participantClient: SupabaseClient | undefined;
let hostClient: SupabaseClient | undefined;

function createSundayClient(storageKey: string): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Sunday Supabase configuration is missing");
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey,
    },
  });
}

export function getSundaySupabase(): SupabaseClient {
  participantClient ??= createSundayClient("sunday-participant-auth");
  return participantClient;
}

export function getSundayHostSupabase(): SupabaseClient {
  hostClient ??= createSundayClient("sunday-host-auth");
  return hostClient;
}
