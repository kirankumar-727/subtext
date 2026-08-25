import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { instance as createVizInstance } from "@viz-js/viz";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const targetDirectory = path.join(repositoryRoot, "docs/authentication");

const mermaid = `flowchart TD
  Founder[Founder] --> GitHub[GitHub OAuth]
  GitHub --> Supabase[Supabase Auth]
  Supabase --> Admission{Signed exact-email admission hook}
  Admission -->|Rejected| Denied[Access Denied]
  Admission -->|Admitted| TokenHook[Signed custom access-token hook]
  TokenHook --> RoleClaim[user_role=admin claim]
  RoleClaim --> Session[Authenticated session]
  Session --> RequireAdmin[requireAdmin()]
  RequireAdmin --> Decision{Authorization decision}
  Decision -->|Unauthorized| Denied
  Decision -->|Authorized| Admin[Protected Admin Workspace]
  Admin --> RLS[RLS-protected PostgreSQL]
`;

const dot = `digraph AuthenticationFlow {
  graph [rankdir="TB", bgcolor="#f4f0e7", pad="0.35", nodesep="0.35", ranksep="0.55"];
  node [shape="box", style="rounded,filled", fillcolor="#fbf8f1", color="#9d9585", fontname="Arial", fontsize="11", margin="0.16"];
  edge [color="#7b7569", fontname="Arial", fontsize="9", arrowsize="0.75"];

  Founder [label="Founder"];
  GitHub [label="GitHub OAuth"];
  Supabase [label="Supabase Auth"];
  Admission [label="Signed exact-email\nadmission hook", shape="diamond", fillcolor="#efe8d8"];
  TokenHook [label="Signed custom\naccess-token hook"];
  RoleClaim [label="user_role=admin\nclaim"];
  Session [label="Authenticated session"];
  RequireAdmin [label="requireAdmin()"];
  Decision [label="Authorization decision", shape="diamond", fillcolor="#efe8d8"];
  Admin [label="Protected Admin Workspace", fillcolor="#e3eadf"];
  RLS [label="RLS-protected PostgreSQL", shape="cylinder", fillcolor="#e3eadf"];
  Denied [label="Access Denied", fillcolor="#f1ded9"];

  Founder -> GitHub -> Supabase -> Admission;
  Admission -> Denied [label="rejected"];
  Admission -> TokenHook [label="admitted"];
  TokenHook -> RoleClaim -> Session -> RequireAdmin -> Decision;
  Decision -> Denied [label="unauthorized"];
  Decision -> Admin [label="authorized"];
  Admin -> RLS;
}
`;

await mkdir(targetDirectory, { recursive: true });
const viz = await createVizInstance();
const svg = viz.renderString(dot, { engine: "dot", format: "svg" });
const fingerprint = createHash("sha256").update(mermaid).update(dot).digest("hex");
const markdown = `# Authentication Flow Diagram

**Generated artifact — do not edit by hand.**  
Flow fingerprint: \`${fingerprint}\`

![Subtext authentication and authorization flow](./authentication-flow.svg)

\`\`\`mermaid
${mermaid.trimEnd()}
\`\`\`
`;

await Promise.all([
  writeFile(path.join(targetDirectory, "authentication-flow.mmd"), mermaid, "utf8"),
  writeFile(path.join(targetDirectory, "authentication-flow.dot"), dot, "utf8"),
  writeFile(path.join(targetDirectory, "authentication-flow.svg"), svg, "utf8"),
  writeFile(path.join(targetDirectory, "authentication-flow.md"), markdown, "utf8"),
]);

process.stdout.write("Generated authentication flow diagram.\n");
