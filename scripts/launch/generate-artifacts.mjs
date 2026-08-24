import { instance } from "@viz-js/viz";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { environmentTargets } from "./environment-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "docs/launch");
await mkdir(dir, { recursive: true });
const mermaid = `flowchart TD
  Founder --> Admin[Private Admin Application]
  Admin --> CMS[Writer Workspace / CMS]
  CMS --> Database[(Supabase PostgreSQL + Storage)]
  Database --> Worker[Publishing Worker]
  Worker --> Coordinator[Public Coordinator]
  Coordinator --> Website[Public Editorial Website]
  Website --> Reader[Reader]
`;
const dot = `digraph LaunchArchitecture { graph [rankdir="TB", bgcolor="#f4f0e7", pad="0.35"]; node [shape="box", style="rounded,filled", fillcolor="#fbf8f1", color="#9d9585", fontname="Arial"]; edge [color="#7b7569"]; Founder -> "Private Admin Application" -> "Writer Workspace / CMS" -> "Supabase PostgreSQL + Storage" -> "Publishing Worker" -> "Public Coordinator" -> "Public Editorial Website" -> Reader; }
`;
const viz = await instance();
const svg = viz.renderString(dot, { engine: "dot", format: "svg" });
const md = `# Final Subtext Platform Architecture

![Final platform architecture](./final-platform-architecture.svg)

\`\`\`mermaid
${mermaid.trim()}
\`\`\`
`;
const rows = Object.entries(environmentTargets).flatMap(([target, definitions]) =>
  definitions.map(
    (item) =>
      `| ${target} | \`${item.name}\` | ${item.destination} | ${item.kind} | ${item.providerManaged ? "Platform-provided; verify" : "Required"} |`,
  ),
);
const environmentDoc = `# Production Environment Configuration Checklist

Generated from \`scripts/launch/environment-contract.mjs\`. Secret values must never be committed, logged, pasted into chat, or prefixed with \`NEXT_PUBLIC_\`.

| Target | Variable | Configure in | Validation | Status |
|---|---|---|---|---|
${rows.join("\n")}

## Configuration commands

- Validate one target: \`npm run launch:env -- --target=public\`
- Validate all targets from a secure operator environment: \`npm run launch:env -- --target=all\`
- Apply Supabase Auth provider/hook configuration: \`npm run auth:configure -- --apply\`
- Deploy Edge Functions using Supabase CLI; do not put function secrets in Vercel browser variables.

## Non-environment configuration

- Supabase production project region, migrations, RLS, Storage buckets and Edge Functions deployed.
- GitHub OAuth production client authorizes only the Supabase callback URI.
- Vercel Public root is \`apps/public\`; Admin root is \`apps/admin\`.
- Cloudflare is authoritative DNS. Vercel records remain DNS-only unless double-proxy behavior is tested.
- Preserve existing MX/TXT mail records when changing nameservers.
`;
await Promise.all([
  writeFile(path.join(dir, "final-platform-architecture.mmd"), mermaid),
  writeFile(path.join(dir, "final-platform-architecture.dot"), dot),
  writeFile(path.join(dir, "final-platform-architecture.svg"), svg),
  writeFile(path.join(dir, "final-platform-architecture.md"), md),
  writeFile(path.join(dir, "environment-configuration-checklist.md"), environmentDoc),
]);
console.log("Generated launch architecture and environment checklist.");
