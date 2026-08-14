import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/internal/publication/route";

describe("signed public publication coordinator", () => {
  beforeEach(() => {
    process.env.REVALIDATION_SECRET = "publication-test-secret-32-bytes-long";
  });

  it("rejects an unsigned cache/render request", async () => {
    const response = await POST(
      new Request("https://subtext.media/api/internal/publication", {
        method: "POST",
        body: JSON.stringify({ mode: "preflight", markdown: "# Story" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("renders canonical Markdown through the shared sanitized pipeline before commit", async () => {
    const response = await POST(
      new Request("https://subtext.media/api/internal/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-subtext-revalidation-secret": "publication-test-secret-32-bytes-long",
        },
        body: JSON.stringify({ mode: "preflight", markdown: "# Story\n\nA safe paragraph." }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
