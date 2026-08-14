import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "./markdown-renderer";

describe("shared Markdown preview renderer", () => {
  it("renders headings, tables, quotes, footnotes and callouts", () => {
    const markdown = `# Heading\n\n> Quote\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nText[^1]\n\n[^1]: Source note\n\n:::callout\nContext\n:::`;
    const html = renderToStaticMarkup(<MarkdownRenderer markdown={markdown} />);
    expect(html).toContain("<h1>");
    expect(html).toContain("<table>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("subtext-callout");
    expect(html).toContain("data-footnote-ref");
  });
  it("renders the editorial Subtext directive without a second content model", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer markdown={":::subtext\nThe visible story is not the whole story.\n:::"} />,
    );
    expect(html).toContain("subtext-editorial-subtext");
  });

  it("does not execute raw HTML", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer markdown={'<script>alert("x")</script>'} />,
    );
    expect(html).not.toContain("<script>");
  });
});
