import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readSupabaseSecretConfig } from "./secret-config";
import type { Database } from "./database.types";

export function createSupabaseAdminClient() {
  const { secretKey, url } = readSupabaseSecretConfig();

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
