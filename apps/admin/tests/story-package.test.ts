import { describe, expect, it } from "vitest";

import {
  parseFrontmatter,
  parseStoryPackage,
  storyFrontmatterSchema,
  deriveSlug,
  MAX_PACKAGE_BYTES,
} from "@/lib/cms/story-package";
import type { StoryFrontmatter } from "@/lib/cms/story-package";

// ---------------------------------------------------------------------------
// Helpers — build a minimal ZIP in memory
// ---------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] ?? 0;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipSourceEntry = {
  name: string;
  data: Uint8Array;
};

function buildZip(entries: ZipSourceEntry[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length + entry.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed
    lv.setUint16(6, 0, true); // Flags
    lv.setUint16(8, 0, true); // Compression: STORED
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0, true); // Mod date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, entry.data.length, true); // Compressed size
    lv.setUint32(22, entry.data.length, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.length);
    localHeaders.push(local);

    // Central directory header
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0, true); // Flags
    cv.setUint16(10, 0, true); // Compression: STORED
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0, true); // Mod date
    cv.setUint32(16, crc, true); // CRC-32
    cv.setUint32(20, entry.data.length, true); // Compressed size
    cv.setUint32(24, entry.data.length, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, offset, true); // Relative offset of local header
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    centralDirSize += ch.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk with central dir
  ev.setUint16(8, entries.length, true); // Entries on this disk
  ev.setUint16(10, entries.length, true); // Total entries
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true); // Comment length

  const totalSize = offset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const lh of localHeaders) {
    result.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const VALID_FRONTMATTER = `---
title: "The Art of Inquiry"
slug: the-art-of-inquiry
pillar: "Psychology"
author: "Jane Researcher"
excerpt: "A deep dive into investigative methods."
seo_title: "The Art of Inquiry — SubText"
seo_description: "An exploration of investigative methodologies."
tags:
  - psychology
  - research
citations:
  - source: "Thinking, Fast and Slow"
    author: "Daniel Kahneman"
    type: book
    isbn: "978-0374533557"
images:
  - file: "cover.jpg"
    alt: "A researcher at work"
    rights: "owned"
    role: "hero"
---`;

const VALID_BODY = `## Introduction

This is the beginning of an important article about investigative methods.

## Background

The history of inquiry stretches back to ancient Greece.`;

function validStoryMd(): string {
  return `${VALID_FRONTMATTER}\n\n${VALID_BODY}`;
}

function validCoverJpg(): Uint8Array {
  // Minimal valid JPEG: SOI marker + minimal data
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function validStoryZip(): Uint8Array {
  return buildZip([
    { name: "story.md", data: textBytes(validStoryMd()) },
    { name: "images/cover.jpg", data: validCoverJpg() },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("YAML frontmatter parsing", () => {
  it("parses scalar values and arrays from frontmatter", () => {
    const { frontmatter, body } = parseFrontmatter(validStoryMd());
    expect(frontmatter.title).toBe("The Art of Inquiry");
    expect(frontmatter.slug).toBe("the-art-of-inquiry");
    expect(frontmatter.pillar).toBe("Psychology");
    expect(frontmatter.author).toBe("Jane Researcher");
    expect(frontmatter.excerpt).toBe("A deep dive into investigative methods.");
    expect(frontmatter.tags).toEqual(["psychology", "research"]);
    expect(body).toContain("## Introduction");
  });

  it("returns empty frontmatter when no --- delimiters are present", () => {
    const { frontmatter, body } = parseFrontmatter("# Just a title\n\nSome content.");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# Just a title\n\nSome content.");
  });

  it("strips BOM before parsing", () => {
    const withBom = "\uFEFF---\ntitle: Test\n---\n\nBody.";
    const { frontmatter, body } = parseFrontmatter(withBom);
    expect(frontmatter.title).toBe("Test");
    expect(body).toBe("Body.");
  });

  it("handles boolean and numeric scalars", () => {
    const { frontmatter } = parseFrontmatter("---\npublished: true\ncount: 42\nrating: 3.5\n---\n\nBody.");
    expect(frontmatter.published).toBe(true);
    expect(frontmatter.count).toBe(42);
    expect(frontmatter.rating).toBe(3.5);
  });

  it("handles null and quoted string values", () => {
    const { frontmatter } = parseFrontmatter("---\nauthor: null\ntitle: \"Quoted Title\"\n---\n\nBody.");
    expect(frontmatter.author).toBe(null);
    expect(frontmatter.title).toBe("Quoted Title");
  });
});

describe("frontmatter schema validation", () => {
  it("accepts valid frontmatter with all required fields", () => {
    const result = storyFrontmatterSchema.safeParse({
      title: "A Story",
      slug: "a-story",
      pillar: "Psychology",
      author: "An Author",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing title", () => {
    const result = storyFrontmatterSchema.safeParse({
      slug: "a-story",
      pillar: "Psychology",
      author: "An Author",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid slug format", () => {
    const result = storyFrontmatterSchema.safeParse({
      title: "A Story",
      slug: "Invalid Slug!",
      pillar: "Psychology",
      author: "An Author",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid citation data", () => {
    const result = storyFrontmatterSchema.safeParse({
      title: "A Story",
      slug: "a-story",
      pillar: "Psychology",
      author: "An Author",
      citations: [
        { source: "A Book", author: "An Author", type: "book", isbn: "123" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects images with missing rights", () => {
    const result = storyFrontmatterSchema.safeParse({
      title: "A Story",
      slug: "a-story",
      pillar: "Psychology",
      author: "An Author",
      images: [{ file: "cover.jpg", alt: "A cover" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts images with 'pending' rights for import (not publication)", () => {
    const result = storyFrontmatterSchema.safeParse({
      title: "A Story",
      slug: "a-story",
      pillar: "Psychology",
      author: "An Author",
      images: [{ file: "cover.jpg", alt: "A cover", rights: "pending" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("story package ZIP validation", () => {
  // 1. Valid ZIP
  it("accepts a valid story package", async () => {
    const zip = validStoryZip();
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.storyMarkdown).toContain("## Introduction");
    expect(result.pkg.images).toHaveLength(1);
    expect(result.pkg.images[0]!.archivePath).toBe("images/cover.jpg");
  });

  // 2. ZIP > 250 KB
  it("rejects packages larger than 250 KB", async () => {
    const oversizeData = textBytes("x".repeat(MAX_PACKAGE_BYTES + 1));
    const zip = buildZip([{ name: "story.md", data: oversizeData }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("package_too_large");
    expect(result.errors[0]!.message).toContain("250 KB");
  });

  // 3. Missing story.md
  it("rejects packages without story.md", async () => {
    const zip = buildZip([
      { name: "images/photo.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "missing_story_md")).toBe(true);
  });

  // 4. Malformed frontmatter
  it("rejects story.md with missing frontmatter delimiters", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes("# Just a title\n\nSome content without frontmatter.") },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "missing_frontmatter")).toBe(true);
  });

  it("rejects story.md with invalid frontmatter values", async () => {
    const badFrontmatter = `---
title: ""
slug: "Invalid Slug!"
pillar: ""
author: ""
---

Body content here.`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(badFrontmatter) },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // 5. Invalid slug
  it("rejects a frontmatter slug with uppercase letters", async () => {
    const badSlug = `---
title: "A Story"
slug: "Bad-Slug"
pillar: "Psychology"
author: "An Author"
---

Body.`;
    const zip = buildZip([{ name: "story.md", data: textBytes(badSlug) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("slug"))).toBe(true);
  });

  // 6. Invalid metadata
  it("rejects frontmatter with unsupported image rights value", async () => {
    const badImageRights = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
images:
  - file: "cover.jpg"
    alt: "A cover"
    rights: "pirated"
---

Body.`;
    const zip = buildZip([{ name: "story.md", data: textBytes(badImageRights) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // 7. Missing citation source
  it("warns when a citation has no URL, DOI, or ISBN", async () => {
    const withCitation = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
citations:
  - source: "Some Book"
    author: "Some Author"
---

Body.`;
    const zip = buildZip([{ name: "story.md", data: textBytes(withCitation) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "citation_no_link")).toBe(true);
  });

  // 8. Missing image
  it("rejects when a frontmatter-referenced image is missing from the package", async () => {
    const storyMd = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
images:
  - file: "nonexistent.jpg"
    alt: "Does not exist"
    rights: "owned"
---

Body.`;
    const zip = buildZip([{ name: "story.md", data: textBytes(storyMd) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "missing_image")).toBe(true);
  });

  // 9. Unknown image rights
  it("warns when image rights are unknown or pending", async () => {
    const storyMd = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
images:
  - file: "cover.jpg"
    alt: "A cover"
    rights: "unknown"
---

Body.`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(storyMd) },
      { name: "images/cover.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "image_rights_unresolved")).toBe(true);
  });

  // 10. Unsafe archive path
  it("rejects packages with path traversal attempts", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "../escape.txt", data: textBytes("bad") },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("unsafe_path");
  });

  it("rejects packages with absolute paths", async () => {
    const zip = buildZip([
      { name: "/etc/passwd", data: textBytes("bad") },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("unsafe_path");
  });

  // 11. Corrupted ZIP
  it("rejects corrupted ZIP data", async () => {
    const corrupted = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const result = await parseStoryPackage(corrupted);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("corrupted_zip");
  });

  // 12. Valid Markdown-only import
  it("accepts a single Markdown file with valid frontmatter (as a ZIP containing one entry)", async () => {
    const simpleMd = `---
title: "A Simple Story"
slug: a-simple-story
pillar: "Psychology"
author: "Jane Researcher"
---

## Introduction

A simple story without images or citations.`;
    const mdOnly = buildZip([
      { name: "story.md", data: textBytes(simpleMd) },
    ]);
    const result = await parseStoryPackage(mdOnly);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.images).toHaveLength(0);
    expect(result.pkg.storyMarkdown).toContain("## Introduction");
  });

  it("rejects empty body after frontmatter", async () => {
    const emptyBody = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
---
`;
    const zip = buildZip([{ name: "story.md", data: textBytes(emptyBody) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "empty_body")).toBe(true);
  });

  it("warns about metadata inconsistency between story.json and frontmatter", async () => {
    const storyJson = JSON.stringify({ title: "Different Title", slug: "different-slug" });
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "images/cover.jpg", data: validCoverJpg() },
      { name: "metadata/story.json", data: textBytes(storyJson) },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "metadata_title_mismatch")).toBe(true);
    expect(result.warnings.some((w) => w.code === "metadata_slug_mismatch")).toBe(true);
  });

  it("warns about unsupported file types in the archive", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "images/script.exe", data: textBytes("bad") },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "unsupported_file_type")).toBe(true);
  });

  it("rejects unexpected top-level entries", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "random/malware.bat", data: textBytes("bad") },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "unexpected_entry")).toBe(true);
  });

  it("rejects empty ZIP archives", async () => {
    const zip = buildZip([]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("empty_package");
  });
});

describe("slug derivation", () => {
  it("uses the frontmatter slug when present", () => {
    const fm: StoryFrontmatter = {
      title: "A Story",
      slug: "a-story",
      pillar: "Psychology",
      author: "An Author",
    };
    expect(deriveSlug(fm)).toBe("a-story");
  });

  it("falls back to slugified title when slug is empty", () => {
    const fm: StoryFrontmatter = {
      title: "A Story",
      slug: "",
      pillar: "Psychology",
      author: "An Author",
    };
    expect(deriveSlug(fm)).toBe("a-story");
  });

  it("generates a fallback slug when both title and slug are empty", () => {
    const fm: StoryFrontmatter = {
      title: "",
      slug: "",
      pillar: "Psychology",
      author: "An Author",
    };
    const slug = deriveSlug(fm);
    expect(slug).toMatch(/^untitled-/);
  });
});

describe("import transaction safety", () => {
  it("does not create persistent state when package validation fails", async () => {
    const corrupted = new Uint8Array([0x00, 0x01, 0x02]);
    const result = await parseStoryPackage(corrupted);
    expect(result.ok).toBe(false);
    // No Supabase calls should have been made
  });

  it("does not create persistent state when frontmatter validation fails", async () => {
    const badMd = `---
title: ""
slug: ""
---

Body.`;
    const zip = buildZip([{ name: "story.md", data: textBytes(badMd) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
  });

  it("identifies all validation errors before returning", async () => {
    const manyErrors = `---
title: ""
slug: "BAD SLUG"
pillar: ""
author: ""
images:
  - file: "missing.jpg"
    alt: ""
    rights: "pirated"
---

Body.`;
    const zip = buildZip([{ name: "story.md", data: textBytes(manyErrors) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Should have multiple errors collected
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("package size enforcement", () => {
  it("enforces the 256,000 byte (250 KB) limit server-side", async () => {
    // Create a package that is exactly at the limit
    const atLimit = textBytes(validStoryMd());
    // Pad to be just under limit (after ZIP overhead)
    const zip = buildZip([{ name: "story.md", data: atLimit }]);
    expect(zip.byteLength).toBeLessThanOrEqual(MAX_PACKAGE_BYTES);

    // Now create one that exceeds the limit
    const bigContent = "x".repeat(MAX_PACKAGE_BYTES);
    const oversize = buildZip([{ name: "story.md", data: textBytes(bigContent) }]);
    const result = await parseStoryPackage(oversize);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("package_too_large");
    expect(result.errors[0]!.message).toContain("250 KB");
  });

  it("reports the actual size in the error message", async () => {
    const bigContent = "y".repeat(MAX_PACKAGE_BYTES + 1000);
    const zip = buildZip([{ name: "story.md", data: textBytes(bigContent) }]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The error should mention the size
    expect(result.errors[0]!.message).toMatch(/\d+(\.\d+)? KB/);
  });
});

describe("image rights handling", () => {
  it("flags 'pending' rights as publication-blocking", async () => {
    const storyMd = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
images:
  - file: "photo.jpg"
    alt: "A photo"
    rights: "pending"
---

Body.`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(storyMd) },
      { name: "images/photo.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "image_rights_unresolved")).toBe(true);
  });

  it("accepts 'owned' rights without warnings", async () => {
    const storyMd = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
images:
  - file: "photo.jpg"
    alt: "A photo"
    rights: "owned"
---

Body.`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(storyMd) },
      { name: "images/photo.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.filter((w) => w.code === "image_rights_unresolved")).toHaveLength(0);
  });

  it("accepts 'public_domain' rights", async () => {
    const storyMd = `---
title: "A Story"
slug: "a-story"
pillar: "Psychology"
author: "An Author"
images:
  - file: "photo.jpg"
    alt: "A photo"
    rights: "public_domain"
---

Body.`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(storyMd) },
      { name: "images/photo.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.filter((w) => w.code === "image_rights_unresolved")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Root directory normalization
// ---------------------------------------------------------------------------

describe("root directory normalization", () => {
  it("accepts a ZIP wrapped in a single top-level directory", async () => {
    const zip = buildZip([
      { name: "my-story/story.md", data: textBytes(validStoryMd()) },
      { name: "my-story/images/", data: new Uint8Array(0) },
      { name: "my-story/images/cover.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.storyMarkdown).toContain("## Introduction");
    expect(result.pkg.images).toHaveLength(1);
    expect(result.pkg.images[0]!.archivePath).toBe("images/cover.jpg");
  });

  it("preserves original paths in allPaths", async () => {
    const zip = buildZip([
      { name: "wrapped-story/story.md", data: textBytes(validStoryMd()) },
      { name: "wrapped-story/images/cover.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.allPaths).toContain("wrapped-story/story.md");
    expect(result.pkg.allPaths).toContain("wrapped-story/images/cover.jpg");
  });

  it("rejects a ZIP with multiple unrelated top-level directories", async () => {
    const zip = buildZip([
      { name: "dir-a/story.md", data: textBytes(validStoryMd()) },
      { name: "dir-b/random.md", data: textBytes("stuff") },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "unexpected_entry")).toBe(true);
  });

  it("accepts a flat ZIP without a wrapper directory", async () => {
    const zip = validStoryZip();
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.images[0]!.archivePath).toBe("images/cover.jpg");
  });
});

// ---------------------------------------------------------------------------
// sources.md footnote registry parsing
// ---------------------------------------------------------------------------

describe("sources.md footnote registry parsing", () => {
  const SOURCES_MD = `# Sources

All sources are real.

## [1] "Example Article" — Wikipedia

Author: Wikipedia contributors
Institution: Wikimedia Foundation
Publication: Online article, accessed 2026
Type: General reference encyclopedia
URL: https://en.wikipedia.org/wiki/Example
Supports: Some section. (Footnote 1.)

## [2] Jane Doe, *A Real Book*

Author: Jane Doe
Institution: Oxford University Press
Publication: 2024, 300 pp., ISBN 978-0-12-345678-9
Type: Academic monograph
URL: https://example.com/book
Supports: Another section. (Footnote 2.)
`;

  it("parses source entries from sources.md", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "images/cover.jpg", data: validCoverJpg() },
      { name: "sources/sources.md", data: textBytes(SOURCES_MD) },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pkg.parsedSources).toHaveLength(2);
    expect(result.pkg.parsedSources[0]!.ordinal).toBe(1);
    expect(result.pkg.parsedSources[0]!.title).toContain("Example Article");
    expect(result.pkg.parsedSources[0]!.url).toBe("https://en.wikipedia.org/wiki/Example");
    expect(result.pkg.parsedSources[0]!.author).toBe("Wikipedia contributors");
    expect(result.pkg.parsedSources[1]!.ordinal).toBe(2);
    expect(result.pkg.parsedSources[1]!.isbn).toBe("978-0-12-345678-9");
  });

  it("maps source types correctly", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "images/cover.jpg", data: validCoverJpg() },
      { name: "sources/sources.md", data: textBytes(SOURCES_MD) },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pkg.parsedSources[0]!.sourceType).toBe("website"); // encyclopedia
    expect(result.pkg.parsedSources[1]!.sourceType).toBe("book"); // monograph
  });
});

// ---------------------------------------------------------------------------
// metadata/media.md image metadata parsing
// ---------------------------------------------------------------------------

describe("metadata/media.md image metadata parsing", () => {
  const MEDIA_MD = `# Media Metadata

## cover.jpg

filename:
cover.jpg
asset_status:
present
type:
jpeg
role:
cover
caption:
A beautiful cover image.
alt_text:
Editorial illustration of a cover scene.
credit:
SubText Media (in-house)
rights_status:
pending

## image-01.jpg

filename:
image-01.jpg
asset_status:
present
type:
jpeg
role:
article
caption:
An inline image.
alt_text:
Editorial illustration of inline content.
credit:
SubText Media (in-house)
rights_status:
pending
`;

  it("parses image metadata from media.md", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "images/cover.jpg", data: validCoverJpg() },
      { name: "metadata/media.md", data: textBytes(MEDIA_MD) },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pkg.imageMetadata).toHaveLength(2);
    expect(result.pkg.imageMetadata[0]!.filename).toBe("cover.jpg");
    expect(result.pkg.imageMetadata[0]!.altText).toContain("cover scene");
    expect(result.pkg.imageMetadata[0]!.rightsStatus).toBe("pending");
    expect(result.pkg.imageMetadata[1]!.filename).toBe("image-01.jpg");
  });
});

// ---------------------------------------------------------------------------
// Cover discovery from frontmatter scalar
// ---------------------------------------------------------------------------

describe("cover discovery from frontmatter", () => {
  it("accepts frontmatter with cover scalar instead of images array", async () => {
    const storyMd = `---\ntitle: "A Story"\nslug: "a-story"\npillar: "Psychology"\nauthor: "An Author"\ncover: "images/cover.jpg"\n---\n\nBody content.`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(storyMd) },
      { name: "images/cover.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pkg.images).toHaveLength(1);
    expect((result.pkg.frontmatter as Record<string, unknown>).cover).toBe("images/cover.jpg");
  });

  it("discovers images from ZIP when no frontmatter images array", async () => {
    const storyMd = `---\ntitle: "A Story"\nslug: "a-story"\npillar: "Psychology"\nauthor: "An Author"\ncover: "images/cover.jpg"\n---\n\nBody content.`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(storyMd) },
      { name: "images/cover.jpg", data: validCoverJpg() },
      { name: "images/photo.jpg", data: validCoverJpg() },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pkg.images).toHaveLength(2);
  });

  it("warns about unresolved image rights from media.md when no frontmatter images", async () => {
    const storyMd = `---\ntitle: "A Story"\nslug: "a-story"\npillar: "Psychology"\nauthor: "An Author"\ncover: "images/cover.jpg"\n---\n\nBody content.`;
    const mediaMd = `# Media\n\n## cover.jpg\nfilename:\ncover.jpg\nrights_status:\npending\nalt_text:\nA cover\ncredit:\nSubText Media\n`;
    const zip = buildZip([
      { name: "story.md", data: textBytes(storyMd) },
      { name: "images/cover.jpg", data: validCoverJpg() },
      { name: "metadata/media.md", data: textBytes(mediaMd) },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings.some((w) => w.code === "image_rights_unresolved")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// images/ directory with non-image files (e.g. README.md)
// ---------------------------------------------------------------------------

describe("images directory with mixed files", () => {
  it("allows .md files in images/ without error", async () => {
    const zip = buildZip([
      { name: "story.md", data: textBytes(validStoryMd()) },
      { name: "images/cover.jpg", data: validCoverJpg() },
      { name: "images/README.md", data: textBytes("# Image credits\n\nAll images are AI-generated.") },
    ]);
    const result = await parseStoryPackage(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pkg.images).toHaveLength(1);
    expect(result.pkg.images[0]!.archivePath).toBe("images/cover.jpg");
  });
});
