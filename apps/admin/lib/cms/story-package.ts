/**
 * SubText Story Package — ZIP parsing, validation, and structure checks.
 *
 * A Story Package is a .zip archive containing:
 *   story.md              (required — Markdown with YAML frontmatter)
 *   images/               (optional)
 *   sources/              (optional — e.g. sources.md)
 *   metadata/             (optional — story.json, inspector.md, media.md, validation.md)
 *
 * Hard limit: 256 000 bytes (≈ 250 KB).
 */

import { slugify } from "@subtext/content";
import { inflateRawSync } from "node:zlib";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_PACKAGE_BYTES = 256_000;

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
]);

const ALLOWED_TEXT_EXTENSIONS = new Set([".md", ".json", ".txt"]);

const ALLOWED_ROOT_ENTRIES = new Set([
  "story.md",
  "images",
  "sources",
  "metadata",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PackageImageEntry = {
  /** Path inside the archive, e.g. "images/cover.webp" */
  archivePath: string;
  /** Raw bytes of the image */
  data: Uint8Array;
  /** Extension including dot */
  extension: string;
};

export type PackageSourceEntry = {
  archivePath: string;
  text: string;
};

/** Structured source parsed from sources.md footnote registry */
export type ParsedSourceEntry = {
  ordinal: number;
  title: string;
  author: string | null;
  url: string | null;
  isbn: string | null;
  doi: string | null;
  publisher: string | null;
  sourceType: string;
};

/** Image metadata parsed from metadata/media.md */
export type ImageMetadata = {
  filename: string;
  altText: string | null;
  caption: string | null;
  credit: string | null;
  rightsStatus: string;
  role: string | null;
};

export type StoryPackage = {
  storyMarkdown: string;
  frontmatter: Record<string, unknown>;
  images: PackageImageEntry[];
  sources: PackageSourceEntry[];
  metadataFiles: Record<string, string>;
  allPaths: string[];
  /** Structured sources parsed from sources.md (when present) */
  parsedSources: ParsedSourceEntry[];
  /** Image metadata parsed from metadata/media.md (when present) */
  imageMetadata: ImageMetadata[];
};

export type PackageValidationError = {
  code: string;
  level: "error" | "warning";
  message: string;
};

export type PackageValidationResult =
  | { ok: true; pkg: StoryPackage; warnings: PackageValidationError[] }
  | { ok: false; errors: PackageValidationError[]; warnings: PackageValidationError[] };

// ---------------------------------------------------------------------------
// YAML frontmatter parsing (lightweight, no external dependency)
// ---------------------------------------------------------------------------

/**
 * Extracts YAML frontmatter from a Markdown string.
 * Returns { frontmatter, body } where frontmatter is a parsed object.
 *
 * Supports:
 * - Scalar values (string, number, boolean, null)
 * - Arrays of scalars
 * - Arrays of objects (one level deep)
 */
export function parseFrontmatter(
  markdown: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const trimmed = markdown.replace(/^\uFEFF/, ""); // strip BOM
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: trimmed };
  }

  const yamlBlock: string = match[1] ?? "";
  // Body starts after the closing ---; strip a single leading newline if present
  const rawBody: string = match[2] ?? "";
  const body = rawBody.startsWith("\n") ? rawBody.slice(1) : rawBody;
  const frontmatter: Record<string, unknown> = {};

  const lines = yamlBlock.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const keyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);

    if (!keyMatch) {
      i++;
      continue;
    }

    const key = keyMatch[1]!;
    const value = keyMatch[2]!.trim();

    if (value !== "") {
      // Simple scalar value
      frontmatter[key] = parseScalar(value);
      i++;
      continue;
    }

    // Block value — could be array of scalars or array of objects
    i++;
    const items: unknown[] = [];

    while (i < lines.length && /^\s+- /.test(lines[i]!)) {
      const itemLine = lines[i]!;
      const itemContent = itemLine.replace(/^\s+- /, "");

      // Check if this is a scalar item or the start of an object
      if (itemContent.includes(": ")) {
        // This is the start of an object in the array
        const obj: Record<string, unknown> = {};
        const objKeyMatch = itemContent.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
        if (objKeyMatch) {
          obj[objKeyMatch[1]!] = parseScalar(objKeyMatch[2]!.trim());
        }
        i++;

        // Collect more object properties (indented more than the - marker)
        while (i < lines.length && /^\s{2,}[A-Za-z_]/.test(lines[i]!) && !/^\s+- /.test(lines[i]!)) {
          const propMatch = lines[i]!.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
          if (propMatch) {
            obj[propMatch[1]!] = parseScalar(propMatch[2]!.trim());
          }
          i++;
        }
        items.push(obj);
      } else {
        // Simple scalar item
        items.push(parseScalar(itemContent));
        i++;
      }
    }

    frontmatter[key] = items;
  }

  return { frontmatter, body };
}

function parseScalar(value: string): string | number | boolean | null {
  if (value === "null" || value === "~" || value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  // Strip surrounding quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Frontmatter schema (what we expect from a valid story.md)
// ---------------------------------------------------------------------------

export const storyFrontmatterSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  pillar: z.string().trim().min(1).max(80),
  category: z.string().trim().max(80).optional(),
  author: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(360).optional(),
  seo_title: z.string().trim().max(120).optional(),
  seo_description: z.string().trim().max(320).optional(),
  cover: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  citations: z
    .array(
      z.object({
        source: z.string().trim().min(1).max(500),
        author: z.string().trim().max(300).optional(),
        url: z.string().trim().max(1000).optional(),
        type: z
          .enum([
            "book",
            "journal_article",
            "news_article",
            "website",
            "report",
            "archive",
            "interview",
            "dataset",
            "video",
            "other",
          ])
          .optional(),
        doi: z.string().trim().max(200).optional(),
        isbn: z.string().trim().max(40).optional(),
        publisher: z.string().trim().max(300).optional(),
        archive_url: z.string().trim().max(1000).optional(),
      }),
    )
    .max(100)
    .optional(),
  images: z
    .array(
      z.object({
        file: z.string().trim().min(1).max(255),
        alt: z.string().trim().min(1).max(500),
        caption: z.string().trim().max(1000).optional(),
        credit: z.string().trim().max(300).optional(),
        rights: z.enum([
          "owned",
          "licensed",
          "public_domain",
          "creative_commons",
          "permission_granted",
          "pending",
          "unknown",
        ]),
        role: z.enum(["hero", "inline", "gallery"]).optional(),
      }),
    )
    .max(20)
    .optional(),
});

export type StoryFrontmatter = z.infer<typeof storyFrontmatterSchema>;

// ---------------------------------------------------------------------------
// ZIP parsing
// ---------------------------------------------------------------------------

/**
 * Parse a ZIP buffer into a StoryPackage. Performs structural validation.
 */
export async function parseStoryPackage(
  zipBytes: Uint8Array,
): Promise<PackageValidationResult> {
  const errors: PackageValidationError[] = [];
  const warnings: PackageValidationError[] = [];

  // --- Size check ---
  if (zipBytes.byteLength > MAX_PACKAGE_BYTES) {
    return {
      ok: false,
      errors: [
        {
          code: "package_too_large",
          level: "error",
          message: `The uploaded package is ${(zipBytes.byteLength / 1024).toFixed(1)} KB. The maximum Story Package size is 250 KB (${MAX_PACKAGE_BYTES.toLocaleString()} bytes).`,
        },
      ],
      warnings: [],
    };
  }

  // --- Parse ZIP ---
  let entries: ZipEntry[];
  try {
    entries = parseZipEntries(zipBytes);
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          code: "corrupted_zip",
          level: "error",
          message: `The uploaded file is not a valid ZIP archive: ${err instanceof Error ? err.message : "unknown error"}.`,
        },
      ],
      warnings: [],
    };
  }

  if (entries.length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: "empty_package",
          level: "error",
          message: "The uploaded ZIP archive is empty.",
        },
      ],
      warnings: [],
    };
  }

  // --- Path safety ---
  for (const entry of entries) {
    if (
      entry.name.includes("..") ||
      entry.name.startsWith("/") ||
      entry.name.startsWith("\\") ||
      /[\x00-\x1f]/.test(entry.name)
    ) {
      return {
        ok: false,
        errors: [
          {
            code: "unsafe_path",
            level: "error",
            message: `The archive contains an unsafe path: "${entry.name}". Path traversal or control characters are not allowed.`,
          },
        ],
        warnings,
      };
    }
  }

  // --- Root directory normalization ---
  // Canonical SubText Story Packages may wrap all content in a single
  // top-level directory (e.g. "the-story-name/story.md"). Detect this and
  // strip the prefix so the rest of the parser sees the canonical layout.
  const nonDirEntries = entries.filter((e) => !e.isDirectory);
  let rootPrefix = "";

  if (nonDirEntries.length > 0) {
    const prefixes = new Set(
      nonDirEntries.map((e) => {
        const slash = e.name.indexOf("/");
        return slash > 0 ? e.name.slice(0, slash + 1) : "";
      }),
    );

    if (prefixes.size === 1) {
      const prefix = [...prefixes][0]!;
      if (prefix && prefix !== "") {
        // Verify that stripping this prefix yields valid root entries
        const virtualRoots = new Set(
          nonDirEntries.map((e) => {
            const stripped = e.name.slice(prefix.length);
            const slash = stripped.indexOf("/");
            return slash > 0 ? stripped.slice(0, slash) : stripped;
          }),
        );
        const allValid = [...virtualRoots].every((r) => ALLOWED_ROOT_ENTRIES.has(r));
        if (allValid) {
          rootPrefix = prefix;
          entries = entries
            .filter((e) => e.name !== prefix && e.name !== prefix.slice(0, -1))
            .map((e) => ({
              ...e,
              name: e.name.slice(prefix.length),
            }));
        }
      }
    }
  }

  // --- Root-level structure ---
  const seenRootEntries = new Set<string>();
  for (const entry of entries) {
    const topLevel = entry.name.split("/")[0] ?? entry.name;
    if (!ALLOWED_ROOT_ENTRIES.has(topLevel)) {
      errors.push({
        code: "unexpected_entry",
        level: "error",
        message: `Unexpected top-level entry "${topLevel}" in the archive. Allowed entries: story.md, images/, sources/, metadata/.`,
      });
    }
    seenRootEntries.add(topLevel);
  }

  // --- File type checks ---
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = extensionOf(entry.name);
    const isImage = ALLOWED_IMAGE_EXTENSIONS.has(ext);
    const isText = ALLOWED_TEXT_EXTENSIONS.has(ext);
    if (!isImage && !isText) {
      errors.push({
        code: "unsupported_file_type",
        level: "error",
        message: `Unsupported file type "${ext || "(none)"}" in "${entry.name}". Allowed: .md, .json, .txt, .jpg, .jpeg, .png, .webp, .avif, .gif.`,
      });
    }
  }

  // --- story.md existence ---
  const storyEntry = entries.find(
    (e) => e.name === "story.md" || e.name === "./story.md",
  );
  if (!storyEntry) {
    return {
      ok: false,
      errors: [
        {
          code: "missing_story_md",
          level: "error",
          message: 'The package does not contain "story.md" at the root level.',
        },
        ...errors,
      ],
      warnings,
    };
  }

  // --- Parse story.md ---
  const storyText = new TextDecoder().decode(storyEntry.data);
  const { frontmatter, body } = parseFrontmatter(storyText);

  if (!body.trim()) {
    errors.push({
      code: "empty_body",
      level: "error",
      message: "The story body (Markdown content after the frontmatter) is empty.",
    });
  }

  if (Object.keys(frontmatter).length === 0) {
    errors.push({
      code: "missing_frontmatter",
      level: "error",
      message:
        "No YAML frontmatter was found in story.md. The file must start with a YAML block between --- delimiters.",
    });
  }

  // --- Validate frontmatter ---
  const parsedFrontmatter = storyFrontmatterSchema.safeParse(frontmatter);
  if (!parsedFrontmatter.success) {
    for (const issue of parsedFrontmatter.error.issues) {
      errors.push({
        code: `frontmatter_${issue.path.join("_") || "invalid"}`,
        level: "error",
        message: `Frontmatter validation: ${issue.message} (field: ${issue.path.join(".") || "root"}).`,
      });
    }
  }

  // --- Collect images ---
  const imageEntries: PackageImageEntry[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("images/")) continue;
    if (entry.isDirectory) continue;
    const ext = extensionOf(entry.name);
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      // Non-image files in images/ (e.g. README.md) are allowed as text
      if (ALLOWED_TEXT_EXTENSIONS.has(ext)) continue;
      errors.push({
        code: "unsupported_image_type",
        level: "error",
        message: `Unsupported image type "${ext}" in "${entry.name}".`,
      });
      continue;
    }
    imageEntries.push({
      archivePath: entry.name,
      data: entry.data,
      extension: ext,
    });
  }

  // --- Validate image references from frontmatter ---
  if (parsedFrontmatter.success && parsedFrontmatter.data.images) {
    const availableImagePaths = new Set(imageEntries.map((i) => i.archivePath));
    for (const imgRef of parsedFrontmatter.data.images) {
      const expectedPath = `images/${imgRef.file}`;
      if (!availableImagePaths.has(expectedPath)) {
        errors.push({
          code: "missing_image",
          level: "error",
          message: `Referenced image "${imgRef.file}" was not found in the images/ directory of the package.`,
        });
      }
      if (imgRef.rights === "pending" || imgRef.rights === "unknown") {
        warnings.push({
          code: "image_rights_unresolved",
          level: "warning",
          message: `Image "${imgRef.file}" has rights status "${imgRef.rights}". This image will block publication until rights are resolved.`,
        });
      }
    }
  }

  // --- Collect sources ---
  const sourceEntries: PackageSourceEntry[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("sources/")) continue;
    if (entry.isDirectory) continue;
    const ext = extensionOf(entry.name);
    if (ext !== ".md" && ext !== ".txt") {
      errors.push({
        code: "unsupported_source_file",
        level: "error",
        message: `Source files must be .md or .txt. Found "${ext}" in "${entry.name}".`,
      });
      continue;
    }
    sourceEntries.push({
      archivePath: entry.name,
      text: new TextDecoder().decode(entry.data),
    });
  }

  // --- Collect metadata files ---
  const metadataFiles: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.name.startsWith("metadata/")) continue;
    if (entry.isDirectory) continue;
    const metaName = entry.name.replace("metadata/", "");
    if (metaName) {
      metadataFiles[metaName] = new TextDecoder().decode(entry.data);
    }
  }

  // --- Validate citations reference sources ---
  if (parsedFrontmatter.success && parsedFrontmatter.data.citations) {
    for (const citation of parsedFrontmatter.data.citations) {
      // A citation must have at least a title/source and either a URL or DOI
      if (!citation.url && !citation.doi && !citation.isbn) {
        warnings.push({
          code: "citation_no_link",
          level: "warning",
          message: `Citation "${citation.source}" has no URL, DOI, or ISBN. Consider adding a verifiable reference.`,
        });
      }
    }
  }

  // --- Metadata consistency warnings ---
  const storyJsonContent = metadataFiles["story.json"];
  if (storyJsonContent) {
    try {
      const metaJson = JSON.parse(storyJsonContent) as Record<string, unknown>;
      if (parsedFrontmatter.success) {
        const fm = parsedFrontmatter.data;
        if (metaJson.title && typeof metaJson.title === "string" && metaJson.title !== fm.title) {
          warnings.push({
            code: "metadata_title_mismatch",
            level: "warning",
            message: `The title in metadata/story.json ("${metaJson.title}") differs from the title in story.md ("${fm.title}"). The frontmatter title will be used.`,
          });
        }
        if (metaJson.slug && typeof metaJson.slug === "string" && metaJson.slug !== fm.slug) {
          warnings.push({
            code: "metadata_slug_mismatch",
            level: "warning",
            message: `The slug in metadata/story.json ("${metaJson.slug}") differs from the slug in story.md ("${fm.slug}"). The frontmatter slug will be used.`,
          });
        }
      }
    } catch {
      warnings.push({
        code: "metadata_json_invalid",
        level: "warning",
        message: "metadata/story.json could not be parsed as JSON. It will be ignored.",
      });
    }
  }

  // --- Parse sources.md footnote registry ---
  const parsedSources: ParsedSourceEntry[] = [];
  const sourcesMdContent = sourceEntries.find((s) =>
    s.archivePath.endsWith("/sources.md") || s.archivePath === "sources.md",
  );
  if (sourcesMdContent) {
    parsedSources.push(...parseSourcesMarkdown(sourcesMdContent.text));
  }

  // --- Parse metadata/media.md for image metadata ---
  let imageMeta: ImageMetadata[] = [];
  const mediaMdContent = metadataFiles["media.md"];
  if (mediaMdContent) {
    imageMeta = parseMediaMarkdown(mediaMdContent);
  }

  // --- Discover images from frontmatter or package structure ---
  // If the frontmatter has an images[] array, validate it normally (already done above).
  // If it doesn't, discover images from the actual files in images/ and enrich
  // them with metadata from media.md where available.
  if (parsedFrontmatter.success && !parsedFrontmatter.data.images && imageEntries.length > 0) {
    for (const img of imageEntries) {
      const filename = img.archivePath.replace("images/", "");
      const meta = imageMeta.find(
        (m) => m.filename === filename || m.filename === filename.replace(/\.[^.]+$/, ""),
      );
      if (meta) {
        if (meta.rightsStatus === "pending" || meta.rightsStatus === "unknown") {
          warnings.push({
            code: "image_rights_unresolved",
            level: "warning",
            message: `Image "${filename}" has rights status "${meta.rightsStatus}" (from metadata/media.md). Publication will be blocked until rights are resolved.`,
          });
        }
      }

      // Warn about images without explicit rights metadata
      if (!meta) {
        warnings.push({
          code: "image_no_metadata",
          level: "warning",
          message: `Image "${filename}" has no metadata in metadata/media.md. Rights status defaults to "unknown".`,
        });
      }
    }
  }

  // If there are blocking errors, fail
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  // Build package
  const normalizedPaths = entries.map((e) => e.name);
  const originalPaths = rootPrefix
    ? normalizedPaths.map((p) => rootPrefix + p)
    : normalizedPaths;

  const pkg: StoryPackage = {
    storyMarkdown: body,
    frontmatter: parsedFrontmatter.success ? parsedFrontmatter.data : frontmatter,
    images: imageEntries,
    sources: sourceEntries,
    metadataFiles,
    allPaths: originalPaths,
    parsedSources,
    imageMetadata: imageMeta,
  };

  return { ok: true, pkg, warnings };
}

// ---------------------------------------------------------------------------
// Minimal ZIP parser
// ---------------------------------------------------------------------------

type ZipEntry = {
  name: string;
  data: Uint8Array;
  isDirectory: boolean;
};

/**
 * Minimal ZIP reader that handles standard ZIP files with STORED and DEFLATED entries.
 */
function parseZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Find the End of Central Directory record
  let eocdOffset = bytes.length - 22;
  while (eocdOffset >= 0) {
    if (view.getUint32(eocdOffset, true) === 0x06054b50) break;
    eocdOffset--;
  }
  if (eocdOffset < 0) {
    throw new Error("Not a valid ZIP file (missing end of central directory)");
  }

  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const centralDirEntries = view.getUint16(eocdOffset + 10, true);

  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;

  for (let i = 0; i < centralDirEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error(`Invalid central directory entry at offset ${offset}`);
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder().decode(nameBytes);

    const isDirectory = name.endsWith("/");

    // Read the local file header to get to the data
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;

    let data: Uint8Array;
    if (isDirectory) {
      data = new Uint8Array(0);
    } else if (compressionMethod === 0) {
      // STORED
      data = bytes.slice(dataOffset, dataOffset + uncompressedSize);
    } else if (compressionMethod === 8) {
      // DEFLATED
      data = inflateSync(bytes.slice(dataOffset, dataOffset + compressedSize));
    } else {
      throw new Error(`Unsupported compression method ${compressionMethod} for "${name}"`);
    }

    entries.push({ name, data, isDirectory });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Synchronous DEFLATE decompression using Node.js zlib.
 */
function inflateSync(compressed: Uint8Array): Uint8Array {
  const buf = inflateRawSync(Buffer.from(compressed));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extensionOf(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot < 0) return "";
  return name.slice(lastDot).toLowerCase();
}

/**
 * Parse sources/sources.md footnote registry into structured source entries.
 *
 * Expected format:
 *   ## [N] Title
 *
 *   Author: ...
 *   URL: ...
 *   ISBN: ... (optional)
 *   Type: ...
 *   Institution: ... (optional)
 */
export function parseSourcesMarkdown(text: string): ParsedSourceEntry[] {
  const entries: ParsedSourceEntry[] = [];
  const blocks = text.split(/^## \[(\d+)\] /m);

  // blocks[0] is the preamble; then alternating [ordinal, body]
  for (let i = 1; i < blocks.length; i += 2) {
    const ordinal = parseInt(blocks[i]!, 10);
    const block = blocks[i + 1] ?? "";
    const titleLine = block.split("\n")[0]?.trim() ?? "";

    const get = (key: string): string | null => {
      const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, "mi"));
      return m ? m[1]!.trim() : null;
    };

    const rawType = get("Type") ?? "other";
    const sourceType = mapSourceType(rawType);

    entries.push({
      ordinal,
      title: titleLine,
      author: get("Author"),
      url: get("URL"),
      isbn: extractIsbn(get("Publication") ?? ""),
      doi: null,
      publisher: get("Institution"),
      sourceType,
    });
  }

  return entries;
}

function mapSourceType(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("monograph") || lower.includes("book")) return "book";
  if (lower.includes("journal") || lower.includes("peer-reviewed")) return "journal_article";
  if (lower.includes("news") || lower.includes("periodical") || lower.includes("magazine"))
    return "news_article";
  if (lower.includes("encyclopedia") || lower.includes("reference")) return "website";
  if (lower.includes("report")) return "report";
  if (lower.includes("archive")) return "archive";
  if (lower.includes("museum") || lower.includes("institutional")) return "website";
  if (lower.includes("government") || lower.includes("official")) return "report";
  if (lower.includes("primary") || lower.includes("text")) return "other";
  if (lower.includes("website") || lower.includes("online")) return "website";
  if (lower.includes("video")) return "video";
  if (lower.includes("dataset")) return "dataset";
  return "other";
}

function extractIsbn(publication: string): string | null {
  const m = publication.match(/ISBN\s+([\d-]+)/i);
  return m ? m[1]!.trim() : null;
}

/**
 * Parse metadata/media.md to extract per-image metadata.
 *
 * Expected format (## headers with field: value pairs):
 *   ## filename.ext
 *   filename: ...
 *   alt_text: ...
 *   caption: ...
 *   credit: ...
 *   rights_status: ...
 *   role: ...
 */
export function parseMediaMarkdown(text: string): ImageMetadata[] {
  const entries: ImageMetadata[] = [];
  const blocks = text.split(/^## /m);

  for (const block of blocks.slice(1)) {
    const headerLine = block.split("\n")[0]?.trim() ?? "";
    const filename = headerLine.replace(/\s*\(.*\)/, "").trim();

    const get = (key: string): string | null => {
      const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, "mi"));
      return m ? m[1]!.trim() : null;
    };

    entries.push({
      filename,
      altText: get("alt_text"),
      caption: get("caption"),
      credit: get("credit"),
      rightsStatus: get("rights_status") ?? "unknown",
      role: get("role"),
    });
  }

  return entries;
}

/**
 * Generate a slug from the frontmatter or title.
 */
export function deriveSlug(frontmatter: StoryFrontmatter): string {
  return frontmatter.slug || slugify(frontmatter.title) || `untitled-${Date.now().toString(36)}`;
}
