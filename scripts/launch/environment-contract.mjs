const commonPublic = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", kind: "https-url", destination: "Vercel" },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", kind: "publishable-key", destination: "Vercel" },
];

export const environmentTargets = {
  public: [
    {
      name: "NEXT_PUBLIC_SITE_URL",
      kind: "https-url",
      expectedOrigin: "https://subtext.media",
      destination: "Vercel Public",
    },
    ...commonPublic.map((item) => ({ ...item, destination: "Vercel Public" })),
    { name: "REVALIDATION_SECRET", kind: "secret", destination: "Vercel Public" },
    { name: "PUBLISHING_WORKER_SECRET", kind: "secret", destination: "Vercel Public" },
    { name: "CRON_SECRET", kind: "secret", destination: "Vercel Public" },
  ],
  admin: [
    {
      name: "NEXT_PUBLIC_SITE_URL",
      kind: "https-url",
      expectedOrigin: "https://subtext.media",
      destination: "Vercel Admin",
    },
    {
      name: "NEXT_PUBLIC_ADMIN_URL",
      kind: "https-url",
      expectedOrigin: "https://admin.subtext.media",
      destination: "Vercel Admin",
    },
    ...commonPublic.map((item) => ({ ...item, destination: "Vercel Admin" })),
    { name: "FOUNDER_EMAIL", kind: "email", destination: "Vercel Admin" },
    { name: "PUBLISHING_WORKER_SECRET", kind: "secret", destination: "Vercel Admin" },
  ],
  "supabase-functions": [
    {
      name: "SUPABASE_URL",
      kind: "https-url",
      destination: "Supabase Edge Functions",
      providerManaged: true,
    },
    {
      name: "SUPABASE_SECRET_KEYS",
      kind: "secret-json",
      destination: "Supabase Edge Functions",
      providerManaged: true,
    },
    { name: "FOUNDER_EMAIL", kind: "email", destination: "Supabase Edge Functions" },
    {
      name: "BEFORE_USER_CREATED_HOOK_SECRET",
      kind: "webhook-secret",
      destination: "Supabase Edge Functions",
    },
    {
      name: "CUSTOM_ACCESS_TOKEN_HOOK_SECRET",
      kind: "webhook-secret",
      destination: "Supabase Edge Functions",
    },
    { name: "PUBLISHING_WORKER_SECRET", kind: "secret", destination: "Supabase Edge Functions" },
    {
      name: "PUBLICATION_API_URL",
      kind: "https-url",
      expectedOrigin: "https://subtext.media",
      destination: "Supabase Edge Functions",
    },
    { name: "REVALIDATION_SECRET", kind: "secret", destination: "Supabase Edge Functions" },
  ],
  operator: [
    { name: "SUPABASE_PROJECT_REF", kind: "project-ref", destination: "Operator/CI only" },
    { name: "SUPABASE_ACCESS_TOKEN", kind: "secret", destination: "Operator/CI only" },
    {
      name: "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID",
      kind: "google-client",
      destination: "Operator/CI only",
    },
    {
      name: "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET",
      kind: "secret",
      destination: "Operator/CI only",
    },
    {
      name: "BEFORE_USER_CREATED_HOOK_SECRET",
      kind: "webhook-secret",
      destination: "Operator/CI only",
    },
    {
      name: "CUSTOM_ACCESS_TOKEN_HOOK_SECRET",
      kind: "webhook-secret",
      destination: "Operator/CI only",
    },
    {
      name: "NEXT_PUBLIC_ADMIN_URL",
      kind: "https-url",
      expectedOrigin: "https://admin.subtext.media",
      destination: "Operator/CI only",
    },
    { name: "NEXT_PUBLIC_SUPABASE_URL", kind: "https-url", destination: "Operator/CI only" },
  ],
};

const placeholderPattern = /replace|example\.com|your-project|change[-_ ]?me/i;

export function validateEnvironment(target, environment) {
  const definitions = environmentTargets[target];
  if (!definitions) return [`Unknown environment target: ${target}`];
  const errors = [];
  for (const definition of definitions) {
    const value = environment[definition.name]?.trim() ?? "";
    if (!value) {
      if (definition.providerManaged) continue;
      errors.push(`${definition.name}: missing`);
      continue;
    }
    if (placeholderPattern.test(value)) errors.push(`${definition.name}: placeholder value`);
    if (definition.kind === "https-url") {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") errors.push(`${definition.name}: HTTPS required`);
        if (definition.expectedOrigin && url.origin !== definition.expectedOrigin)
          errors.push(`${definition.name}: expected ${definition.expectedOrigin}`);
      } catch {
        errors.push(`${definition.name}: invalid URL`);
      }
    }
    if (definition.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      errors.push(`${definition.name}: invalid email`);
    if (definition.kind === "secret" && value.length < 32)
      errors.push(`${definition.name}: minimum 32 characters`);
    if (definition.kind === "secret-key" && (!value.startsWith("sb_secret_") || value.length < 24))
      errors.push(`${definition.name}: invalid Supabase secret key`);
    if (definition.kind === "secret-json") {
      try {
        const keys = JSON.parse(value);
        if (typeof keys.default !== "string" || !keys.default.startsWith("sb_secret_"))
          errors.push(`${definition.name}: missing default Supabase secret key`);
      } catch {
        errors.push(`${definition.name}: invalid secret-key JSON`);
      }
    }
    if (definition.kind === "publishable-key" && !value.startsWith("sb_publishable_"))
      errors.push(`${definition.name}: invalid publishable key`);
    if (definition.kind === "webhook-secret" && !/^v1,whsec_[A-Za-z0-9+/_=-]{16,}$/.test(value))
      errors.push(`${definition.name}: invalid Standard Webhooks secret`);
    if (definition.kind === "project-ref" && !/^[a-z]{20}$/.test(value))
      errors.push(`${definition.name}: invalid project ref`);
    if (definition.kind === "google-client" && !value.endsWith(".apps.googleusercontent.com"))
      errors.push(`${definition.name}: invalid Google client ID`);
  }
  const secrets = definitions
    .filter((item) => ["secret", "secret-key", "webhook-secret"].includes(item.kind))
    .map((item) => environment[item.name])
    .filter(Boolean);
  if (new Set(secrets).size !== secrets.length)
    errors.push("Secrets assigned to this target must be distinct");
  for (const name of Object.keys(environment)) {
    if (name.startsWith("NEXT_PUBLIC_") && /SECRET|TOKEN|FOUNDER|PASSWORD|SERVICE/i.test(name))
      errors.push(`${name}: privileged value must not be public`);
  }
  return errors;
}
