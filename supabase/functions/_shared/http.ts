import { Webhook } from "npm:standardwebhooks@1.0.0";

/**
 * Get a required secret from Supabase Edge Function environment variables.
 *
 * Supabase Auth Hook secrets may be stored in the format:
 *   v1,whsec_xxxxxxxxx
 *
 * standardwebhooks expects:
 *   whsec_xxxxxxxxx
 */
export function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }

  // Remove only the version prefix.
  // Keep the whsec_ prefix intact.
  if (value.startsWith("v1,")) {
    return value.slice(3);
  }

  return value;
}

/**
 * Get the founder email configured in Supabase secrets.
 */
export function requiredFounderEmail(): string {
  const value = Deno.env.get("FOUNDER_EMAIL")?.trim();

  if (!value) {
    throw new Error(
      "Missing required founder authorization configuration",
    );
  }

  return value;
}

/**
 * Verify a Supabase Auth Hook request using Standard Webhooks.
 */
export function verifyAuthHook<T>(
  request: Request,
  payload: string,
  secretName: string,
): T {
  const secret = requiredSecret(secretName);

  const webhook = new Webhook(secret);

  const headers = Object.fromEntries(request.headers.entries());

  return webhook.verify(payload, headers) as T;
}

/**
 * Standard JSON response helper.
 */
export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}