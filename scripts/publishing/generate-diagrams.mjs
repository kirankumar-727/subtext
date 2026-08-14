import { instance } from "@viz-js/viz";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "docs/publishing");
await mkdir(dir, { recursive: true });
const viz = await instance();
const diagrams = {
  "publishing-engine-flow": {
    mmd: `flowchart TD\n  Job[publication_jobs] --> Claim[Atomic SKIP LOCKED claim]\n  Claim --> Validate[Revision / source / media validation]\n  Validate --> Preflight[@subtext/content render preflight]\n  Preflight --> Commit[Atomic database commit]\n  Commit --> Search[Search projection trigger]\n  Search --> Revalidate[Targeted cache + sitemap + RSS revalidation]\n  Revalidate --> Verify[Public projection verification]\n  Verify --> Success[Succeeded]\n`,
    dot: `digraph G{rankdir=TB;node[shape=box,style="rounded,filled",fillcolor="#fbf8f1"];Job[label="publication_jobs"];Claim[label="Atomic SKIP LOCKED claim"];Validate[label="Revision / source / media validation"];Preflight[label="@subtext/content render preflight"];Commit[label="Atomic database commit"];Search[label="Search projection trigger"];Revalidate[label="Cache + sitemap + RSS revalidation"];Verify[label="Public projection verification"];Success[label="Succeeded"];Job->Claim->Validate->Preflight->Commit->Search->Revalidate->Verify->Success;}\n`,
  },
  "publication-job-state-machine": {
    mmd: `stateDiagram-v2\n  [*] --> queued\n  queued --> processing: claim\n  failed --> processing: retry claim\n  processing --> committed: atomic commit\n  committed --> verifying\n  verifying --> succeeded\n  processing --> failed: retryable\n  committed --> failed: external failure\n  verifying --> failed: verification failure\n  failed --> dead_letter: exhausted/permanent\n  processing --> dead_letter: permanent\n  succeeded --> [*]\n  dead_letter --> [*]\n`,
    dot: `digraph G{rankdir=LR;node[shape=ellipse,style=filled,fillcolor="#fbf8f1"];queued->processing[label="claim"];failed->processing[label="retry"];processing->committed;committed->verifying;verifying->succeeded;processing->failed;committed->failed;verifying->failed;failed->dead_letter;processing->dead_letter;}\n`,
  },
  "failure-retry-flow": {
    mmd: `flowchart TD\n  Failure --> Classify{Retryable?}\n  Classify -->|No| Dead[dead_letter + event]\n  Classify -->|Yes| Attempts{Attempts remain?}\n  Attempts -->|No| Dead\n  Attempts -->|Yes| Backoff[Exponential available_at]\n  Backoff --> Failed[failed]\n  Failed --> Reclaim[Lease + reclaim]\n  Reclaim --> Resume{Committed already?}\n  Resume -->|No| Validate[Restart validation]\n  Resume -->|Yes| Verify[Resume verification]\n`,
    dot: `digraph G{rankdir=TB;node[shape=box,style="rounded,filled",fillcolor="#fbf8f1"];Failure->Classify;Classify[shape=diamond,label="Retryable?"];Classify->Dead[label="no"];Classify->Attempts[label="yes"];Attempts[shape=diamond,label="Attempts remain?"];Attempts->Dead[label="no"];Attempts->Backoff[label="yes"];Backoff->Failed->Reclaim->Resume;Resume[shape=diamond,label="Committed already?"];Resume->Validate[label="no"];Resume->Verify[label="yes"];Dead[label="dead_letter + event"];}\n`,
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
console.log("Generated publishing engine diagrams.");
