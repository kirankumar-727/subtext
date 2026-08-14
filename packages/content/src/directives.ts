import type { Root } from "mdast";
import { visit } from "unist-util-visit";

type DirectiveNode = {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined>;
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};

const embedHosts = new Set(["www.youtube-nocookie.com", "player.vimeo.com"]);

export function remarkSubtextDirectives() {
  return (tree: Root) => {
    visit(tree, (node) => {
      const directive = node as unknown as DirectiveNode;
      if (!directive.type.endsWith("Directive")) return;
      directive.data ??= {};

      if (directive.name === "callout" || directive.name === "subtext") {
        directive.data.hName = "aside";
        directive.data.hProperties = {
          className: [
            directive.name === "subtext" ? "subtext-editorial-subtext" : "subtext-callout",
          ],
        };
      }

      if (directive.name === "embed") {
        const rawUrl = directive.attributes?.url;
        try {
          const url = new URL(rawUrl ?? "");
          if (url.protocol !== "https:" || !embedHosts.has(url.hostname)) return;
          directive.data.hName = "iframe";
          directive.data.hProperties = {
            src: url.toString(),
            title: directive.attributes?.title ?? "Embedded media",
            loading: "lazy",
            allow: "fullscreen; picture-in-picture",
            allowFullScreen: true,
            referrerPolicy: "strict-origin-when-cross-origin",
            className: ["subtext-embed"],
          };
        } catch {
          // Invalid embeds remain inert text after sanitization.
        }
      }
    });
  };
}
