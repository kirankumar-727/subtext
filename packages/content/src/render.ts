import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { remarkSubtextDirectives } from "./directives";
import { subtextSanitizeSchema } from "./sanitize";

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkSubtextDirectives)
    .use(remarkRehype)
    .use(rehypeSanitize, subtextSanitizeSchema)
    .use(rehypeStringify)
    .process(markdown);
  return String(result);
}
