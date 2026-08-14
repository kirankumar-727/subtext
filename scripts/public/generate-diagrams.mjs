import { instance } from "@viz-js/viz";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "docs/public");
await mkdir(dir, { recursive: true });
const viz = await instance();
const diagrams = {
  "public-website-architecture": {
    mmd: `flowchart LR\n  CMS --> Revision[Immutable Revision]\n  Revision --> Job[Publication Job]\n  Job --> Engine[Publishing Engine]\n  Engine --> Views[Safe Public Views]\n  Views --> Next[Public Next.js]\n  Next --> CDN[Targeted Cache/CDN]\n`,
    dot: `digraph G{rankdir=LR;node[shape=box,style="rounded,filled",fillcolor="#fbf8f1"];CMS->"Immutable Revision"->"Publication Job"->"Publishing Engine"->"Safe Public Views"->"Public Next.js"->"Targeted Cache/CDN";}\n`,
  },
  "public-content-rendering-flow": {
    mmd: `flowchart TD\n  View[published_articles] --> Revision[Canonical Markdown]\n  Citations[published_citations] --> Revision\n  Media[published_media] --> Page[Article Page]\n  Revision --> Pipeline[@subtext/content]\n  Pipeline --> Sanitize[Sanitized semantic HTML]\n  Sanitize --> Page\n  Page --> SEO[Metadata + JSON-LD]\n`,
    dot: `digraph G{rankdir=TB;node[shape=box,style="rounded,filled",fillcolor="#fbf8f1"];"published_articles"->"Canonical Markdown";"published_citations"->"Canonical Markdown";"Canonical Markdown"->"@subtext/content"->"Sanitized semantic HTML"->"Article Page";"published_media"->"Article Page";"Article Page"->"Metadata + JSON-LD";}\n`,
  },
  "public-route-map": {
    mmd: `flowchart TD\n  Root[/] --> History[/history]\n  Root --> Business[/business]\n  Root --> Psychology[/psychology]\n  Root --> Society[/society]\n  History --> Article[/{pillar}/{slug}]\n  Business --> Article\n  Psychology --> Article\n  Society --> Article\n  Root --> Search[/search]\n  Root --> About[/about]\n  Root --> Sitemap[/sitemap.xml]\n  Root --> RSS[/feed.xml]\n`,
    dot: `digraph G{rankdir=TB;node[shape=box,style="rounded,filled",fillcolor="#fbf8f1"];"/"->{"/history" "/business" "/psychology" "/society" "/search" "/about" "/sitemap.xml" "/feed.xml"};{"/history" "/business" "/psychology" "/society"}->"/{pillar}/{slug}";}\n`,
  },
};
for (const [name, value] of Object.entries(diagrams)) {
  const svg = viz.renderString(value.dot, { engine: "dot", format: "svg" });
  const md = `# ${name
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")}\n\n![${name}](./${name}.svg)\n\n\`\`\`mermaid\n${value.mmd.trim()}\n\`\`\`\n`;
  await Promise.all([
    writeFile(path.join(dir, `${name}.mmd`), value.mmd),
    writeFile(path.join(dir, `${name}.dot`), value.dot),
    writeFile(path.join(dir, `${name}.svg`), svg),
    writeFile(path.join(dir, `${name}.md`), md),
  ]);
}
console.log("Generated public website diagrams.");
