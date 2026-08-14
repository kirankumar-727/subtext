import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("public robots policy", () => {
  it("allows editorial pages, blocks internal APIs and declares the sitemap", () => {
    const policy = robots();
    expect(policy.rules).toMatchObject({ userAgent: "*", allow: "/", disallow: ["/api/"] });
    expect(policy.sitemap).toBe("https://subtext.media/sitemap.xml");
  });
});
