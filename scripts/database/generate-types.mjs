import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";

import { introspectSchema } from "./introspect-schema.mjs";
import { applyMigrations, createSchemaDatabase, repositoryRoot } from "./schema-runtime.mjs";

function quoteProperty(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value);
}

function enumNameFromType(dataType) {
  const match = dataType.match(/^(?:public\.)?([a-z_][a-z0-9_]*)$/);
  return match?.[1];
}

function postgresTypeToTypeScript(dataType, enumNames) {
  if (dataType.endsWith("[]")) {
    return `${postgresTypeToTypeScript(dataType.slice(0, -2), enumNames)}[]`;
  }

  const normalized = dataType.replace(/^public\./, "");
  if (enumNames.has(normalized)) {
    return `Database["public"]["Enums"]["${normalized}"]`;
  }

  if (
    normalized === "text" ||
    normalized === "uuid" ||
    normalized === "date" ||
    normalized === "timestamp with time zone" ||
    normalized === "timestamp without time zone" ||
    normalized === "time with time zone" ||
    normalized === "time without time zone" ||
    normalized === "tsvector" ||
    normalized.startsWith("character varying")
  ) {
    return "string";
  }

  if (
    normalized === "smallint" ||
    normalized === "integer" ||
    normalized === "bigint" ||
    normalized === "real" ||
    normalized === "double precision" ||
    normalized.startsWith("numeric") ||
    normalized.startsWith("decimal")
  ) {
    return "number";
  }

  if (normalized === "boolean") return "boolean";
  if (normalized === "json" || normalized === "jsonb") return "Json";
  if (normalized === "bytea") return "string";

  const enumName = enumNameFromType(dataType);
  if (enumName && enumNames.has(enumName)) {
    return `Database["public"]["Enums"]["${enumName}"]`;
  }

  return "unknown";
}

function nullableType(column, enumNames) {
  const baseType = postgresTypeToTypeScript(column.data_type, enumNames);
  return column.nullable ? `${baseType} | null` : baseType;
}

function renderRelationships(table) {
  const foreignKeys = table.constraints.filter((constraint) => constraint.type === "f");
  if (foreignKeys.length === 0) return "[]";

  const entries = foreignKeys.map((foreignKey) => {
    const oneToOne = table.constraints.some(
      (constraint) =>
        ["p", "u"].includes(constraint.type) &&
        constraint.columns.length === foreignKey.columns.length &&
        foreignKey.columns.every((column) => constraint.columns.includes(column)),
    );

    return `{
              foreignKeyName: ${JSON.stringify(foreignKey.name)}
              columns: ${JSON.stringify(foreignKey.columns)}
              isOneToOne: ${oneToOne}
              referencedRelation: ${JSON.stringify(foreignKey.referenced_table)}
              referencedColumns: ${JSON.stringify(foreignKey.referencedColumns)}
            }`;
  });

  return `[\n            ${entries.join(",\n            ")}\n          ]`;
}

function renderTable(table, enumNames) {
  const row = table.columns
    .map(
      (column) => `            ${quoteProperty(column.name)}: ${nullableType(column, enumNames)}`,
    )
    .join("\n");

  const insert = table.columns
    .map((column) => {
      const property = quoteProperty(column.name);
      if (column.is_generated) return `            ${property}?: never`;
      const optional = column.nullable || column.default_expression !== null || column.is_identity;
      return `            ${property}${optional ? "?" : ""}: ${nullableType(column, enumNames)}`;
    })
    .join("\n");

  const update = table.columns
    .map((column) => {
      const property = quoteProperty(column.name);
      return column.is_generated
        ? `            ${property}?: never`
        : `            ${property}?: ${nullableType(column, enumNames)}`;
    })
    .join("\n");

  return `        ${quoteProperty(table.name)}: {
          Row: {
${row}
          }
          Insert: {
${insert}
          }
          Update: {
${update}
          }
          Relationships: ${renderRelationships(table)}
        }`;
}

function renderView(view, enumNames) {
  const row = view.columns
    .map(
      (column) =>
        `            ${quoteProperty(column.name)}: ${nullableType(
          {
            ...column,
            data_type:
              column.data_type === "USER-DEFINED" ? column.underlying_type : column.data_type,
          },
          enumNames,
        )}`,
    )
    .join("\n");

  return `        ${quoteProperty(view.name)}: {
          Row: {
${row}
          }
          Relationships: []
        }`;
}

function renderFunctions() {
  return `        append_publication_event: {
          Args: { p_job_id: string; p_step: string; p_level: Database["public"]["Enums"]["publication_event_level"]; p_message: string; p_details?: Json | null }
          Returns: number
        }
        extend_publication_job_lease: {
          Args: { p_job_id: string; p_worker_id: string; p_lease_seconds?: number }
          Returns: boolean
        }
        commit_publication_job: {
          Args: { p_job_id: string; p_worker_id: string }
          Returns: { article_id: string; publication_action: Database["public"]["Enums"]["publication_action"]; canonical_path: string; pillar_slug: string; category_slug: string | null; content_checksum: string | null; target_revision_id: string | null; already_committed: boolean }[]
        }
        mark_publication_job_verifying: {
          Args: { p_job_id: string; p_worker_id: string }
          Returns: undefined
        }
        succeed_publication_job: {
          Args: { p_job_id: string; p_worker_id: string; p_details?: Json | null }
          Returns: undefined
        }
        fail_publication_job: {
          Args: { p_job_id: string; p_worker_id: string; p_error_code: string; p_error_detail: Json; p_retryable: boolean }
          Returns: { final_status: Database["public"]["Enums"]["publication_job_status"]; next_attempt_at: string | null }[]
        }
        create_story_draft: {
          Args: {
            p_title: string
            p_slug: string
            p_excerpt: string
            p_body_markdown: string
            p_body_plain_text: string
            p_pillar_id: string
            p_category_id: string | null
            p_word_count: number
            p_reading_time_minutes: number
          }
          Returns: { article_id: string; revision_id: string; row_version: number }[]
        }
        save_story_draft: {
          Args: {
            p_article_id: string
            p_expected_row_version: number
            p_title: string
            p_slug: string
            p_excerpt: string
            p_body_markdown: string
            p_body_plain_text: string
            p_pillar_id: string
            p_category_id: string | null
            p_tag_ids: string[]
            p_source_ids: string[]
            p_cover_media_asset_id: string | null
            p_seo_title: string
            p_seo_description: string
            p_word_count: number
            p_reading_time_minutes: number
          }
          Returns: { article_id: string; revision_id: string; row_version: number; saved_at: string }[]
        }
        request_story_publication: {
          Args: {
            p_article_id: string
            p_action: Database["public"]["Enums"]["publication_action"]
            p_target_revision_id: string | null
            p_idempotency_key: string
          }
          Returns: {
            publication_job_id: string
            job_status: Database["public"]["Enums"]["publication_job_status"]
          }[]
        }
        claim_publication_jobs: {
          Args: {
            claiming_worker_id: string
            batch_size?: number
            lease_seconds?: number
          }
          Returns: Database["public"]["Tables"]["publication_jobs"]["Row"][]
        }
        search_published_articles: {
          Args: {
            search_query: string
            pillar_slug?: string | null
            result_limit?: number
            result_offset?: number
          }
          Returns: {
            article_id: string
            canonical_path: string
            title: string
            dek: string | null
            author_name: string
            pillar_name: string
            category_name: string | null
            tags: string[]
            published_at: string
            rank: number
          }[]
        }`;
}

function renderDatabaseTypes(schema) {
  const enumNames = new Set(schema.enums.map(({ name }) => name));
  const tableTypes = schema.tables.map((table) => renderTable(table, enumNames)).join("\n");
  const viewTypes = schema.views.map((view) => renderView(view, enumNames)).join("\n");
  const enumTypes = schema.enums
    .map(
      ({ name, values }) =>
        `        ${quoteProperty(name)}: ${values.map((value) => JSON.stringify(value)).join(" | ")}`,
    )
    .join("\n");
  const enumConstants = schema.enums
    .map(({ name, values }) => `      ${quoteProperty(name)}: ${JSON.stringify(values)} as const,`)
    .join("\n");

  return `/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: ordered SQL in supabase/migrations.
 * Regenerate with: npm run db:generate
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
${tableTypes}
    }
    Views: {
${viewTypes}
    }
    Functions: {
${renderFunctions()}
    }
    Enums: {
${enumTypes}
    }
    CompositeTypes: Record<never, never>
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
${enumConstants}
    },
  },
} as const
`;
}

export async function generateTypes(schema) {
  const targetPath = path.join(repositoryRoot, "packages/supabase/src/database.types.ts");
  const formattedTypes = await format(renderDatabaseTypes(schema), {
    parser: "typescript",
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    printWidth: 100,
  });
  await writeFile(targetPath, formattedTypes, "utf8");
  return targetPath;
}

async function main() {
  const database = await createSchemaDatabase();

  try {
    await applyMigrations(database);
    const schema = await introspectSchema(database);
    const targetPath = await generateTypes(schema);
    process.stdout.write(`Generated ${path.relative(repositoryRoot, targetPath)}\n`);
  } finally {
    await database.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
