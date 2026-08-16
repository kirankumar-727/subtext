import {
  decideBeforeUserCreated,
  type BeforeUserCreatedEvent,
} from "../_shared/founder-policy.ts";

import {
  jsonResponse,
  requiredFounderEmail,
  verifyAuthHook,
} from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  const payload = await request.text();

  try {
    const event = verifyAuthHook<BeforeUserCreatedEvent>(
      request,
      payload,
      "BEFORE_USER_CREATED_HOOK_SECRET",
    );

    const decision = decideBeforeUserCreated(
      event,
      requiredFounderEmail(),
    );

    const status = decision.error?.http_code ?? 200;

    return jsonResponse(decision, status);
  } catch (error) {
    console.error(
      "BEFORE_USER_CREATED_HOOK_ERROR:",
      error,
    );

    return jsonResponse(
      {
        error: {
          http_code: 401,
          message:
            error instanceof Error
              ? error.message
              : "Invalid request.",
        },
      },
      401,
    );
  }
});