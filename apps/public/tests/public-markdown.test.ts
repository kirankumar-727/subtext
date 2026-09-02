import { describe, expect, it } from "vitest";
import { sanitizePublicCitationMarkdown, sanitizePublicMarkdown } from "@/lib/public-markdown";

describe("public citation Markdown boundary", () => {
  it("keeps only references present in the public citation projection", () => {
    const markdown = [
      "Reviewed claim[^public] and private claim[^private].",
      "",
      "[^public]: An editor-authored definition that must be replaced.",
      "[^private]: Private research notes must never render.",
    ].join("\n");

    expect(sanitizePublicCitationMarkdown(markdown, ["public"])).toBe(
      "Reviewed claim[^public] and private claim.",
    );
  });

  it("removes inline footnotes without a normalized public citation row", () => {
    expect(sanitizePublicCitationMarkdown("A claim^[private context].", [])).toBe("A claim.");
  });

  it("keeps controlled media routes but removes direct Storage and arbitrary route paths", () => {
    const markdown = [
      "![public](/api/media/90000000-0000-4000-8000-000000000001)",
      "![private](https://project.supabase.co/storage/v1/object/public/media-public/private/w.webp)",
      "![arbitrary](/api/media/../../private)",
      "[private source](https://project.supabase.co/storage/v1/object/sign/media-public/private)",
      "Private path https://project.supabase.co/storage/v1/object/public/media-public/private/w.webp.",
      "[controlled media](/api/media/90000000-0000-4000-8000-000000000001)",
      "![editorial](https://example.com/editorial.jpg)",
    ].join("\n");

    const sanitized = sanitizePublicMarkdown(markdown, [], "https://subtext.media");

    expect(sanitized).toContain("/api/media/90000000-0000-4000-8000-000000000001");
    expect(sanitized).not.toContain("storage/v1");
    expect(sanitized).not.toContain("media-public/private");
    expect(sanitized).not.toContain("/api/media/../../private");
    expect(sanitized).toContain("[private source]");
    expect(sanitized).toContain("[controlled media]");
    expect(sanitized).toContain("https://example.com/editorial.jpg");
  });

  it("only permits an absolute controlled route on the configured public origin", () => {
    expect(
      sanitizePublicMarkdown(
        "![safe](https://subtext.media/api/media/90000000-0000-4000-8000-000000000001)",
        [],
        "https://subtext.media",
      ),
    ).toContain("/api/media/");
    expect(
      sanitizePublicMarkdown(
        "![unsafe](https://evil.example/api/media/90000000-0000-4000-8000-000000000001)",
        [],
        "https://subtext.media",
      ),
    ).toBe("");
  });
});
