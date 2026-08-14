import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAccessError } from "@/lib/auth/errors";

const requireAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/authorization", () => ({
  requireAdmin: requireAdminMock,
}));

import { protectedAdminActionProbe } from "@/app/admin/actions";
import { performLogout } from "@/app/auth/actions";
import { GET as getProtectedSession } from "@/app/api/admin/session/route";

describe("privileged API and server-action boundaries", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
  });

  it("allows an explicitly authorized API request", async () => {
    requireAdminMock.mockResolvedValue({ userId: "founder-id" });
    const response = await getProtectedSession();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true, authorized: true });
  });

  it("rejects an unauthenticated direct API request", async () => {
    requireAdminMock.mockRejectedValue(new AdminAccessError("unauthenticated"));
    const response = await getProtectedSession();
    expect(response.status).toBe(401);
  });

  it("rejects an authenticated unauthorized direct API request", async () => {
    requireAdminMock.mockRejectedValue(new AdminAccessError("unauthorized"));
    const response = await getProtectedSession();
    expect(response.status).toBe(403);
  });

  it("rejects a direct privileged server-action invocation", async () => {
    requireAdminMock.mockRejectedValue(new AdminAccessError("unauthorized"));
    await expect(protectedAdminActionProbe()).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("permits a privileged server action only after authorization", async () => {
    requireAdminMock.mockResolvedValue({ userId: "founder-id" });
    await expect(protectedAdminActionProbe()).resolves.toEqual({
      authorized: true,
      userId: "founder-id",
    });
  });
});

describe("logout", () => {
  it("invalidates the Supabase session globally", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await performLogout({ auth: { signOut } });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
