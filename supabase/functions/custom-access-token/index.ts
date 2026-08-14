import { decideCustomAccessToken, type CustomAccessTokenEvent } from "../_shared/founder-policy.ts";
import { jsonResponse, requiredFounderEmail, verifyAuthHook } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const payload = await request.text();

  try {
    const event = verifyAuthHook<CustomAccessTokenEvent>(
      request,
      payload,
      "CUSTOM_ACCESS_TOKEN_HOOK_SECRET",
    );
    return jsonResponse(decideCustomAccessToken(event, requiredFounderEmail()));
  } catch {
    return jsonResponse(
      {
        error: {
          http_code: 401,
          message: "Invalid request.",
        },
      },
      401,
    );
  }
});
