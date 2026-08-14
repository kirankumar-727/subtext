import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

export function createSupabasePublicServerClient() {
  const { publishableKey, url } = readSupabasePublicConfig();
  return createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
