import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  const { publishableKey, url } = readSupabasePublicConfig();

  browserClient ??= createBrowserClient<Database>(url, publishableKey);

  return browserClient;
}
