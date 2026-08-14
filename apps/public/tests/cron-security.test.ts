import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/internal/publishing-tick/route";

afterEach(() => vi.unstubAllEnvs());

describe("publishing recovery cron", () => {
  it("fails closed without the Cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(new Request("https://subtext.media/api/internal/publishing-tick"));
    expect(response.status).toBe(403);
  });

  it("fails closed when worker configuration is absent", async () => {
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    vi.stubEnv("PUBLISHING_WORKER_SECRET", "");
    const response = await GET(
      new Request("https://subtext.media/api/internal/publishing-tick", {
        headers: { authorization: `Bearer ${"c".repeat(32)}` },
      }),
    );
    expect(response.status).toBe(503);
  });
});
