import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/auth/callback/route";

describe("OAuth callback failure handling", () => {
  it("sends a rejected OAuth/admission flow to Access Denied", async () => {
    const response = await GET(
      new NextRequest("https://admin.subtext.media/auth/callback?error=access_denied"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.subtext.media/access-denied");
  });

  it("rejects a malformed callback without exchanging a session", async () => {
    const response = await GET(new NextRequest("https://admin.subtext.media/auth/callback"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://admin.subtext.media/login?error=authentication_failed",
    );
  });
});
