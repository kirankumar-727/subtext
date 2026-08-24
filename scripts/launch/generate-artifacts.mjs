import { instance } from "@viz-js/viz";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENVIRONMENT_MODE_VARIABLE,
  environmentModes,
  environmentTargets,
} from "./environment-contract.mjs";

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
const environmentDoc = `# Environment Configuration Checklist

Generated from \`scripts/launch/environment-contract.mjs\`. Secret values must never be committed, logged, pasted into chat, or prefixed with \`NEXT_PUBLIC_\`.

## Explicit environment mode

Set \`${ENVIRONMENT_MODE_VARIABLE}\` explicitly in the secure validation environment to exactly one of:

${environmentModes.map((mode) => `- \`${mode}\``).join("\n")}

The validator fails closed when the mode is absent or invalid. The mode is a validation selector; it is not a substitute for the required target variables.

| Target | Variable | Configure in | Validation | Status |
|---|---|---|---|---|
${rows.join("\n")}

## Origin policy

- **Production:** Public values must use exactly \`https://subtext.media\`; Admin values must use exactly \`https://admin.subtext.media\`.
- **Staging:** Public, Admin and \`PUBLICATION_API_URL\` values must be HTTPS origins matching a single stable \`*.vercel.app\` project host. Arbitrary domains and production custom domains are rejected.
- Supabase URLs must remain HTTPS. Provider-managed \`SUPABASE_URL\` and \`SUPABASE_SECRET_KEYS\` are verified in the Edge Function environment rather than copied into a browser environment.

## Configuration commands

- Validate one production target: \`${ENVIRONMENT_MODE_VARIABLE}=production npm run launch:env -- --target=public\`
- Validate all production targets from a secure operator environment: \`${ENVIRONMENT_MODE_VARIABLE}=production npm run launch:env -- --target=all\`
- Validate one staging target: \`${ENVIRONMENT_MODE_VARIABLE}=staging npm run launch:env -- --target=public\`
- Validate all staging targets from a secure operator environment: \`${ENVIRONMENT_MODE_VARIABLE}=staging npm run launch:env -- --target=all\`
- Apply Supabase Auth provider/hook configuration only from an approved secure operator environment: \`npm run auth:configure -- --apply\`
- Deploy Edge Functions using Supabase CLI; do not put function secrets in Vercel browser variables.

## Non-environment configuration

- Supabase project region, migrations, RLS, Storage buckets and Edge Functions must be verified or deployed by the authorized operator for the selected environment.
- GitHub OAuth clients must authorize only the exact Supabase callback URI for their isolated environment.
- Vercel Public root is \`apps/public\`; Admin root is \`apps/admin\`.
- Initial staging uses only stable \`.vercel.app\` URLs and does not attach production domains or change DNS.
- Preserve existing MX/TXT mail records during any future production DNS operation.
`;
await Promise.all([
  writeFile(path.join(dir, "final-platform-architecture.mmd"), mermaid),
  writeFile(path.join(dir, "final-platform-architecture.dot"), dot),
  writeFile(path.join(dir, "final-platform-architecture.svg"), svg),
  writeFile(path.join(dir, "final-platform-architecture.md"), md),
  writeFile(path.join(dir, "environment-configuration-checklist.md"), environmentDoc),
]);
console.log("Generated launch architecture and environment checklist.");
