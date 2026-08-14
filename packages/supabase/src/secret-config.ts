import "server-only";
import { readSupabasePublicConfig } from "./config";

export function readSupabaseSecretConfig() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing required server credential");
  return { ...readSupabasePublicConfig(), secretKey } as const;
}
