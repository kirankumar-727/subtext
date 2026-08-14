import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthClaims } from "@/lib/auth/authorization-core";
import { createAdminProxyHandler, type SessionRefresher } from "@/lib/auth/proxy-handler";

const founderClaims: AuthClaims = {
  sub: "60000000-0000-4000-8000-000000000001",
  email: "founder@subtext.media",
  user_role: "admin",
  is_anonymous: false,
  app_metadata: { provider: "google", providers: ["google"] },
};

function request(pathname: string) {
  return new NextRequest(`https://admin.subtext.media${pathname}`);
}

function refresher(claims: AuthClaims | null): SessionRefresher {
  return (async (incomingRequest: NextRequest) => {
    const response = NextResponse.next({ request: incomingRequest });
    response.cookies.set("session-refresh-test", "preserved", { httpOnly: true });
    return { claims, error: null, response };
  }) as SessionRefresher;
}

describe("admin proxy security boundary", () => {
  beforeEach(() => {
    process.env.FOUNDER_EMAIL = "founder@subtext.media";
    process.env.NEXT_PUBLIC_ADMIN_URL = "https://admin.subtext.media";
  });

  it("redirects an unauthenticated direct /admin request to login", async () => {
    const response = await createAdminProxyHandler(refresher(null))(request("/admin"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.subtext.media/login");
    expect(response.cookies.get("session-refresh-test")?.value).toBe("preserved");
  });

  it("allows the founder claim through the optimistic route layer", async () => {
    const response = await createAdminProxyHandler(refresher(founderClaims))(request("/admin"));
    expect(response.status).toBe(200);
  });

  it("redirects an authenticated unauthorized account before rendering", async () => {
    const response = await createAdminProxyHandler(
      refresher({ ...founderClaims, email: "not-founder@example.com", user_role: null }),
    )(request("/admin/direct-url"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.subtext.media/access-denied");
  });

  it("rejects a direct unauthenticated API request with 401 JSON", async () => {
    const response = await createAdminProxyHandler(refresher(null))(request("/api/admin/session"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("rejects a direct unauthorized API request with 403 JSON", async () => {
    const response = await createAdminProxyHandler(
      refresher({ ...founderClaims, user_role: null }),
    )(request("/api/admin/session"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("redirects an already-authorized founder away from login", async () => {
    const response = await createAdminProxyHandler(refresher(founderClaims))(request("/login"));
    expect(response.headers.get("location")).toBe("https://admin.subtext.media/admin");
  });
});
