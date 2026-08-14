import { describe, expect, it } from "vitest";
import { deriveContentMetrics, markdownToPlainText, slugify } from "./metrics";

describe("canonical Markdown derivation", () => {
  it("preserves Markdown separately while deriving deterministic plain text", () => {
    const markdown = "# A title\n\nA **careful** [story](https://example.com).";
    expect(markdownToPlainText(markdown)).toBe("A title A careful story.");
    expect(deriveContentMetrics(markdown)).toMatchObject({ wordCount: 5, readingTimeMinutes: 1 });
  });
  it("creates stable URL slugs", () => {
    expect(slugify("Hampi: Beyond the Ruins")).toBe("hampi-beyond-the-ruins");
  });
});
