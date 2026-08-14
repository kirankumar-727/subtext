function requiredPublicEnvironmentValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required public environment variable: ${name}`);
  return value;
}

export function readSupabasePublicConfig() {
  return {
    url: requiredPublicEnvironmentValue(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: requiredPublicEnvironmentValue(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  } as const;
}
