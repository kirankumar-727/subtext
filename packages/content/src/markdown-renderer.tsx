import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";

import { remarkSubtextDirectives } from "./directives";
import { subtextSanitizeSchema } from "./sanitize";

type MarkdownRendererProps = {
  markdown: string;
  className?: string;
};

export function MarkdownRenderer({ markdown, className }: MarkdownRendererProps) {
  return (
    <article className={["subtext-prose", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, remarkSubtextDirectives]}
        rehypePlugins={[[rehypeSanitize, subtextSanitizeSchema]]}
        components={{
          img({ alt, src, title }: ComponentProps<"img">) {
            return (
              <figure>
                <img alt={alt ?? ""} loading="lazy" src={src} />
                {title ? <figcaption>{title}</figcaption> : null}
              </figure>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
