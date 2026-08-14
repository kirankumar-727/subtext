import { z } from "zod";

import { publicEnvironmentSchema } from "./public";

export const founderAuthorizationEnvironmentSchema = z.object({
  FOUNDER_EMAIL: z.email(),
  NEXT_PUBLIC_ADMIN_URL: z.url(),
});

export type FounderAuthorizationEnvironment = z.infer<typeof founderAuthorizationEnvironmentSchema>;

export function readFounderAuthorizationEnvironment(): FounderAuthorizationEnvironment {
  return founderAuthorizationEnvironmentSchema.parse({
    FOUNDER_EMAIL: process.env.FOUNDER_EMAIL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  });
}

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(20),
  FOUNDER_EMAIL: z.email(),
  PUBLISHING_SIGNING_SECRET: z.string().min(32),
  REVALIDATION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(input: unknown): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}

export function readServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    FOUNDER_EMAIL: process.env.FOUNDER_EMAIL,
    PUBLISHING_SIGNING_SECRET: process.env.PUBLISHING_SIGNING_SECRET,
    REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });
}
