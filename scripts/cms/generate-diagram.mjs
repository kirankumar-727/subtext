import { instance } from "@viz-js/viz";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "docs/cms");
await mkdir(dir, { recursive: true });
const mmd = `flowchart TD\n  Admin --> Stories\n  Stories --> NewStory[New Story]\n  NewStory --> Write\n  Write --> Autosave\n  Autosave --> Preview\n  Preview --> Publish\n  Publish --> Engine[Publishing Engine]\n`;
const dot = `digraph WriterFlow { graph [rankdir="TB",bgcolor="#f4f0e7",pad="0.3"]; node [shape="box",style="rounded,filled",fillcolor="#fbf8f1",color="#9d9585",fontname="Arial"]; edge [color="#7b7569"]; Admin -> Stories -> "New Story" -> Write -> Autosave -> Preview -> Publish -> "Publishing Engine"; }\n`;
const viz = await instance();
const svg = viz.renderString(dot, { engine: "dot", format: "svg" });
const md = `# Writer Workspace Flow\n\n![Writer Workspace flow](./writer-workspace-flow.svg)\n\n\`\`\`mermaid\n${mmd.trim()}\n\`\`\`\n`;
await Promise.all([
  writeFile(path.join(dir, "writer-workspace-flow.mmd"), mmd),
  writeFile(path.join(dir, "writer-workspace-flow.dot"), dot),
  writeFile(path.join(dir, "writer-workspace-flow.svg"), svg),
  writeFile(path.join(dir, "writer-workspace-flow.md"), md),
]);
console.log("Generated Writer Workspace flow diagram.");
