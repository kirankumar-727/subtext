import { Webhook } from "npm:standardwebhooks@1.0.0";

export function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value.replace(/^v\d+,whsec_/, "");
}

export function requiredFounderEmail(): string {
  const value = Deno.env.get("FOUNDER_EMAIL");
  if (!value) throw new Error("Missing required founder authorization configuration");
  return value;
}

export function verifyAuthHook<T>(request: Request, payload: string, secretName: string): T {
  const webhook = new Webhook(requiredSecret(secretName));
  return webhook.verify(payload, Object.fromEntries(request.headers)) as T;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
