import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { instance as createVizInstance } from "@viz-js/viz";

import { generateTypes } from "./generate-types.mjs";
import { introspectSchema } from "./introspect-schema.mjs";
import {
  applyMigrations,
  createSchemaDatabase,
  listSqlFiles,
  migrationsDirectory,
  repositoryRoot,
} from "./schema-runtime.mjs";

const documentationDirectory = path.join(repositoryRoot, "docs/database");

const actionNames = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

function markdownCell(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function mermaidType(dataType) {
  const normalized = dataType
    .replace(/^public\./, "")
    .replace("timestamp with time zone", "timestamptz")
    .replace("timestamp without time zone", "timestamp")
    .replace("double precision", "double")
    .replaceAll("[]", "_array")
    .replaceAll(/[^A-Za-z0-9_]/g, "_");
  return normalized || "unknown";
}

function tableKeyFlags(table, columnName) {
  const flags = new Set();
  for (const constraint of table.constraints) {
    if (!constraint.columns.includes(columnName)) continue;
    if (constraint.type === "p") flags.add("PK");
    if (constraint.type === "f") flags.add("FK");
    if (constraint.type === "u") flags.add("UK");
  }
  return [...flags].join(", ");
}

function isUniqueForeignKey(table, foreignKey) {
  return table.constraints.some(
    (constraint) =>
      ["p", "u"].includes(constraint.type) &&
      constraint.columns.length === foreignKey.columns.length &&
      constraint.columns.every((column) => foreignKey.columns.includes(column)),
  );
}

function renderErDiagram(schema) {
  const lines = ["erDiagram", "  %% GENERATED from supabase/migrations. Do not edit by hand."];

  for (const table of schema.tables) {
    lines.push(`  ${table.name} {`);
    for (const column of table.columns) {
      const flags = tableKeyFlags(table, column.name);
      lines.push(`    ${mermaidType(column.data_type)} ${column.name}${flags ? ` ${flags}` : ""}`);
    }
    lines.push("  }");
  }

  for (const table of schema.tables) {
    for (const foreignKey of table.constraints.filter(({ type }) => type === "f")) {
      const nullable = foreignKey.columns.some(
        (columnName) => table.columns.find(({ name }) => name === columnName)?.nullable,
      );
      const unique = isUniqueForeignKey(table, foreignKey);
      const parentCardinality = nullable ? "o|" : "||";
      const childCardinality = unique ? "o|" : "o{";
      const label = `${foreignKey.name}: ${foreignKey.columns.join(",")}`;
      lines.push(
        `  ${foreignKey.referenced_table} ${parentCardinality}--${childCardinality} ${table.name} : "${label}"`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function dotStringEscape(value) {
  return String(value).replaceAll('"', '\\"');
}

function renderErDot(schema) {
  const lines = [
    "digraph SubtextER {",
    '  graph [rankdir="LR", bgcolor="#f4f0e7", pad="0.35", nodesep="0.35", ranksep="0.9", concentrate="true"];',
    '  node [shape="box", style="rounded,filled", fillcolor="#fbf8f1", color="#9d9585", fontname="Courier", fontsize="8", margin="0.12"];',
    '  edge [color="#7b7569", fontcolor="#555149", fontname="Arial", fontsize="7", arrowsize="0.6"];',
  ];

  for (const table of schema.tables) {
    const columns = table.columns.map((column) => {
      const flags = tableKeyFlags(table, column.name);
      return `${column.name} : ${mermaidType(column.data_type)}${column.nullable ? "?" : ""}${flags ? ` [${flags}]` : ""}`;
    });
    const label = dotStringEscape(
      `${table.name}\\n${"─".repeat(table.name.length)}\\n${columns.join("\\l")}\\l`,
    );
    lines.push(`  ${table.name} [label="${label}"];`);
  }

  for (const table of schema.tables) {
    for (const foreignKey of table.constraints.filter(({ type }) => type === "f")) {
      const cardinality = isUniqueForeignKey(table, foreignKey) ? "1:0..1" : "1:0..N";
      lines.push(
        `  ${foreignKey.referenced_table} -> ${table.name} [label="${cardinality}", tooltip="${dotStringEscape(foreignKey.name)}"];`,
      );
    }
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function renderDependencyDot() {
  return `digraph SubtextDependencies {
  graph [rankdir="LR", bgcolor="#f4f0e7", pad="0.35", nodesep="0.35", ranksep="0.8", splines="ortho"];
  node [shape="box", style="rounded,filled", fillcolor="#fbf8f1", color="#9d9585", fontname="Arial", fontsize="10"];
  edge [color="#7b7569", fontname="Arial", fontsize="8", arrowsize="0.7"];

  subgraph cluster_editorial { label="Editorial core"; color="#cbc5b7"; authors; pillars; categories; tags; articles; article_revisions; article_tags; }
  subgraph cluster_research { label="Research provenance"; color="#cbc5b7"; sources; source_notes; citations; }
  subgraph cluster_media { label="Media pipeline"; color="#cbc5b7"; media_originals [label="storage.media-originals", shape="cylinder"]; media_public [label="storage.media-public", shape="cylinder"]; media_assets; media_variants; article_media; }
  subgraph cluster_publish { label="Publishing"; color="#cbc5b7"; publication_jobs; publication_events; redirects; slug_history; }
  subgraph cluster_discovery { label="Discovery"; color="#cbc5b7"; search_projection; featured_collections; featured_collection_items; site_settings; audit_logs; }

  authors -> articles;
  pillars -> categories;
  pillars -> articles;
  categories -> articles;
  tags -> article_tags;
  articles -> article_tags;
  articles -> article_revisions;
  article_revisions -> articles [style="dashed", label="deferred pointers"];
  sources -> source_notes;
  sources -> citations;
  article_revisions -> citations;
  media_originals -> media_assets;
  media_assets -> media_variants;
  media_public -> media_variants;
  article_revisions -> article_media;
  media_assets -> article_media;
  articles -> publication_jobs;
  article_revisions -> publication_jobs;
  publication_jobs -> publication_events;
  publication_jobs -> articles [label="atomic promotion"];
  articles -> redirects;
  redirects -> slug_history;
  authors -> search_projection;
  pillars -> search_projection;
  categories -> search_projection;
  tags -> search_projection;
  article_revisions -> search_projection;
  articles -> search_projection;
  featured_collections -> featured_collection_items;
  articles -> featured_collection_items;
  articles -> audit_logs [style="dotted", label="mutation trail"];
}
`;
}

function renderDependencyDiagram(schema) {
  const tableNames = new Set(schema.tables.map(({ name }) => name));
  const lines = [
    "flowchart LR",
    "  %% GENERATED from the final schema and known workflow contracts.",
    "  subgraph EditorialCore[Editorial core]",
    "    authors --> articles",
    "    pillars --> categories",
    "    pillars --> articles",
    "    categories --> articles",
    "    articles --> article_revisions",
    "    article_revisions -. deferred pointers .-> articles",
    "    tags --> article_tags",
    "    articles --> article_tags",
    "  end",
    "  subgraph Research[Research provenance]",
    "    sources --> citations",
    "    sources --> source_notes",
    "    article_revisions --> citations",
    "  end",
    "  subgraph Media[Media pipeline]",
    "    storage_media_originals[(storage.media-originals)] --> media_assets",
    "    media_assets --> media_variants",
    "    storage_media_public[(storage.media-public)] --> media_variants",
    "    article_revisions --> article_media",
    "    media_assets --> article_media",
    "  end",
    "  subgraph Publishing[Publishing workflow]",
    "    article_revisions --> publication_jobs",
    "    articles --> publication_jobs",
    "    publication_jobs --> publication_events",
    "    publication_jobs -->|atomic pointer promotion| articles",
    "    articles --> redirects",
    "    articles --> slug_history",
    "    redirects --> slug_history",
    "  end",
    "  subgraph Discovery[Reader discovery]",
    "    authors --> search_projection",
    "    pillars --> search_projection",
    "    categories --> search_projection",
    "    tags --> search_projection",
    "    article_revisions --> search_projection",
    "    articles --> search_projection",
    "    articles --> featured_collection_items",
    "    featured_collections --> featured_collection_items",
    "  end",
  ];

  for (const requiredTable of [
    "authors",
    "articles",
    "article_revisions",
    "publication_jobs",
    "search_projection",
    "media_assets",
  ]) {
    if (!tableNames.has(requiredTable)) {
      throw new Error(`Dependency graph contract references missing table: ${requiredTable}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function constraintNamesForColumn(table, columnName) {
  return table.constraints
    .filter((constraint) => constraint.columns.includes(columnName))
    .map((constraint) => constraint.name)
    .join(", ");
}

function renderTableReference(table) {
  const lines = [
    `## \`${table.name}\``,
    "",
    table.description ?? "No table comment supplied.",
    "",
    `**RLS:** ${table.rls_enabled ? "Enabled" : "Disabled"}`,
    "",
    "### Columns",
    "",
    "| Column | PostgreSQL type | Null | Default / generated | Constraints | Description |",
    "|---|---|---:|---|---|---|",
  ];

  for (const column of table.columns) {
    const defaultValue = column.is_generated
      ? `GENERATED: ${column.default_expression}`
      : column.is_identity
        ? "IDENTITY"
        : column.default_expression;
    lines.push(
      `| \`${column.name}\` | \`${markdownCell(column.data_type)}\` | ${column.nullable ? "Yes" : "No"} | ${markdownCell(defaultValue)} | ${markdownCell(constraintNamesForColumn(table, column.name))} | ${markdownCell(column.description)} |`,
    );
  }

  lines.push("", "### Relationships", "");
  const foreignKeys = table.constraints.filter(({ type }) => type === "f");
  if (foreignKeys.length === 0) {
    lines.push("No outgoing foreign keys.");
  } else {
    lines.push(
      "| Constraint | Local columns | References | On update | On delete | Deferrable |",
      "|---|---|---|---|---|---|",
    );
    for (const foreignKey of foreignKeys) {
      lines.push(
        `| \`${foreignKey.name}\` | ${foreignKey.columns.map((value) => `\`${value}\``).join(", ")} | \`${foreignKey.referenced_table}(${foreignKey.referencedColumns.join(", ")})\` | ${actionNames[foreignKey.update_action_code]} | ${actionNames[foreignKey.delete_action_code]} | ${foreignKey.is_deferrable ? `Yes${foreignKey.is_initially_deferred ? ", initially deferred" : ""}` : "No"} |`,
      );
    }
  }

  lines.push("", "### Constraints", "");
  for (const constraint of table.constraints) {
    lines.push(`- **\`${constraint.name}\`** — \`${constraint.definition}\``);
  }

  lines.push("", "### Index strategy", "");
  for (const index of table.indexes) {
    lines.push(`- **\`${index.name}\`** — \`${index.definition}\``);
  }

  lines.push("", "### RLS policy summary", "");
  for (const policy of table.policies) {
    const roles = Array.isArray(policy.roles) ? policy.roles.join(", ") : policy.roles;
    lines.push(
      `- **\`${policy.name}\`** — ${policy.command} for ${markdownCell(roles)}; USING: \`${markdownCell(policy.using_expression)}\`; CHECK: \`${markdownCell(policy.check_expression)}\`.`,
    );
  }

  lines.push("", "### Triggers", "");
  if (table.triggers.length === 0) {
    lines.push("No project trigger.");
  } else {
    for (const trigger of table.triggers) {
      lines.push(`- **\`${trigger.name}\`** — \`${trigger.definition}\``);
    }
  }

  return lines.join("\n");
}

function renderSchemaReference(schema, sourceSummary) {
  const lines = [
    "# Subtext Media Database Reference",
    "",
    "**Generated artifact — do not edit by hand.**",
    "",
    `Schema fingerprint: \`${sourceSummary.fingerprint}\``,
    "",
    `Source migrations: ${sourceSummary.files.map((file) => `\`${file}\``).join(", ")}`,
    "",
    "This reference is generated by applying the ordered Supabase migrations to an ephemeral PostgreSQL runtime and introspecting PostgreSQL catalogs. It documents every Subtext-owned base table.",
    "",
    "## Contract summary",
    "",
    `- Base tables: **${schema.tables.length}**`,
    `- Safe public views: **${schema.views.length}**`,
    `- Enums: **${schema.enums.length}**`,
    `- SQL helper functions: **${schema.functions.length}**`,
    "- Storage buckets: **2** (`media-originals`, `media-public`)",
    "",
    "## Table index",
    "",
    ...schema.tables.map(
      ({ name, description }) => `- [\`${name}\`](#${name.replaceAll("_", "-")}) — ${description}`,
    ),
    "",
    ...schema.tables.map(renderTableReference),
    "",
    "# Safe public views",
    "",
  ];

  for (const view of schema.views) {
    lines.push(
      `## \`${view.name}\``,
      "",
      view.description ?? "Safe public read model.",
      "",
      `Columns: ${view.columns.map(({ name }) => `\`${name}\``).join(", ")}.`,
      "",
    );
  }

  lines.push("# Enums", "");
  for (const enumDefinition of schema.enums) {
    lines.push(
      `- **\`${enumDefinition.name}\`** — ${enumDefinition.values.map((value) => `\`${value}\``).join(", ")}`,
    );
  }

  lines.push(
    "",
    "# Supabase Storage policy summary",
    "",
    "- `media-originals` is private. Only the authenticated admin claim can insert/read; referenced originals cannot be deleted through the founder client.",
    "- `media-public` is private. Public bytes are available only through `/api/media/{variantId}`, which rechecks the published projection and receives a short-lived signed URL from the protected `public-media` Edge Function; admins retain signed preview/remediation access.",
    "- Anonymous roles have no `storage.buckets` or `storage.objects` SELECT privilege. Bucket definitions and all Storage policies are migration-managed in `20260808000800_storage_buckets_and_policies.sql` and subsequent security migrations.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function renderErDocument(sourceSummary) {
  return `# Subtext Media Entity Relationship Diagram

**Generated artifact — do not edit by hand.**  
Schema fingerprint: \`${sourceSummary.fingerprint}\`

The diagram includes all Subtext-owned base tables, primary/foreign/unique key markers, relationship labels, and inferred cardinality. Supabase-managed Storage tables are external platform dependencies and are represented in the dependency graph rather than duplicated here.

![Generated Subtext Media ER diagram](./er-diagram.svg)

\`\`\`mermaid
${sourceSummary.erDiagram.trimEnd()}
\`\`\`

## Cardinality conventions

- \`||\` — exactly one parent is required by a non-null foreign key.
- \`o|\` — the parent link or one-to-one child is optional.
- \`o{\` — zero or many child rows.
- Many-to-many relationships are materialized through \`article_tags\` and \`featured_collection_items\`.
- \`articles.current_draft_revision_id\` and \`articles.published_revision_id\` form deliberate deferred circular references to immutable \`article_revisions\`.
`;
}

async function migrationSourceSummary(erDiagram) {
  const files = await listSqlFiles(migrationsDirectory);
  const hash = createHash("sha256");
  const creationOrder = [];

  for (const file of files) {
    const content = await readFile(path.join(migrationsDirectory, file), "utf8");
    hash.update(file);
    hash.update("\0");
    hash.update(content);
    for (const match of content.matchAll(/create\s+table\s+public\.([a-z_]+)/gi)) {
      creationOrder.push({ table: match[1], migration: file });
    }
  }

  return {
    files,
    fingerprint: hash.digest("hex"),
    creationOrder,
    erDiagram,
  };
}

function renderDependencyDocument(schema, sourceSummary, dependencyDiagram) {
  const foreignKeys = schema.tables.flatMap((table) =>
    table.constraints
      .filter(({ type }) => type === "f")
      .map((foreignKey) => ({ ...foreignKey, tableName: table.name })),
  );
  const cascadePaths = foreignKeys.filter(
    ({ delete_action_code: code }) => actionNames[code] !== "RESTRICT",
  );

  return `# Subtext Media Database Dependency Graph

**Generated artifact — do not edit by hand.**  
Schema fingerprint: \`${sourceSummary.fingerprint}\`

![Generated Subtext Media database dependency graph](./dependency-graph.svg)

\`\`\`mermaid
${dependencyDiagram.trimEnd()}
\`\`\`

## Migration dependency order

${sourceSummary.files.map((file, index) => `${index + 1}. \`${file}\``).join("\n")}

## Table creation order

${sourceSummary.creationOrder.map(({ table, migration }, index) => `${index + 1}. \`${table}\` — \`${migration}\``).join("\n")}

The only intentional cycle is \`articles ↔ article_revisions\`: the article is created first, revisions reference it, and two deferred article pointer foreign keys are added afterward.

## Delete/update cascade paths

${cascadePaths
  .map(
    ({
      name,
      tableName,
      referenced_table: referencedTable,
      delete_action_code: deleteCode,
      update_action_code: updateCode,
    }) =>
      `- \`${referencedTable}\` → \`${tableName}\` via \`${name}\`: ON DELETE ${actionNames[deleteCode]}, ON UPDATE ${actionNames[updateCode]}.`,
  )
  .join("\n")}

All other foreign keys use RESTRICT/NO ACTION to preserve publication history and provenance.

## Publishing workflow dependencies

1. \`articles\` owns lifecycle state and points to an immutable \`article_revisions\` row.
2. \`publication_jobs\` targets both the stable article and exact immutable revision.
3. \`publication_events\` append step-level worker evidence.
4. Atomic pointer/status promotion refreshes \`search_projection\` through a database trigger.
5. Slug or pillar changes create \`redirects\` and one-to-one immutable \`slug_history\` rows.
6. Public views read only the currently published revision.

## Search indexing dependencies

\`search_projection\` depends on \`articles\`, \`article_revisions\`, \`authors\`, \`pillars\`, \`categories\`, \`article_tags\`, and \`tags\`. Triggers refresh the projection when publication pointers, bylines, taxonomy, slugs, or tags change. The generated \`search_vector\` drives weighted FTS; GIN trigram indexes cover title and slug fallbacks.

## Media pipeline dependencies

1. The private \`media-originals\` bucket stores source objects referenced by \`media_assets.original_storage_key\`.
2. \`media_assets\` stores provenance, rights, focal point, and processing state.
3. \`media_variants\` stores immutable, pre-generated derivative metadata and public object keys.
4. \`article_media\` attaches an asset to one immutable revision with role, order, alt text, caption, and credit.
5. \`published_media\` exposes only ready, rights-cleared, public derivative metadata.
`;
}

async function main() {
  await mkdir(documentationDirectory, { recursive: true });
  let database = await createSchemaDatabase();

  try {
    await applyMigrations(database);
    const schema = await introspectSchema(database);
    await database.close();
    database = null;

    const erDiagram = renderErDiagram(schema);
    const dependencyDiagram = renderDependencyDiagram(schema);
    const erDot = renderErDot(schema);
    const dependencyDot = renderDependencyDot();
    const viz = await createVizInstance();
    const erSvg = viz.renderString(erDot, { engine: "dot", format: "svg" });
    const dependencySvg = viz.renderString(dependencyDot, { engine: "dot", format: "svg" });
    const sourceSummary = await migrationSourceSummary(erDiagram);

    await generateTypes(schema);
    await writeFile(path.join(documentationDirectory, "er-diagram.mmd"), erDiagram, "utf8");
    await writeFile(path.join(documentationDirectory, "er-diagram.dot"), erDot, "utf8");
    await writeFile(path.join(documentationDirectory, "er-diagram.svg"), erSvg, "utf8");
    await writeFile(
      path.join(documentationDirectory, "dependency-graph.mmd"),
      dependencyDiagram,
      "utf8",
    );
    await writeFile(
      path.join(documentationDirectory, "dependency-graph.dot"),
      dependencyDot,
      "utf8",
    );
    await writeFile(
      path.join(documentationDirectory, "dependency-graph.svg"),
      dependencySvg,
      "utf8",
    );
    await writeFile(
      path.join(documentationDirectory, "er-diagram.md"),
      renderErDocument(sourceSummary),
      "utf8",
    );
    await writeFile(
      path.join(documentationDirectory, "dependency-graph.md"),
      renderDependencyDocument(schema, sourceSummary, dependencyDiagram),
      "utf8",
    );
    await writeFile(
      path.join(documentationDirectory, "schema-reference.md"),
      renderSchemaReference(schema, sourceSummary),
      "utf8",
    );
    await writeFile(
      path.join(documentationDirectory, "schema.snapshot.json"),
      `${JSON.stringify(
        {
          fingerprint: sourceSummary.fingerprint,
          migrations: sourceSummary.files,
          schema,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    process.stdout.write(
      `Generated database types and ${schema.tables.length}-table documentation in docs/database.\n`,
    );
  } finally {
    if (database) await database.close();
  }
}

await main();
