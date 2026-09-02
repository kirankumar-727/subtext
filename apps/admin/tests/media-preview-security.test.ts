import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const queriesPath = fileURLToPath(new URL("../lib/cms/queries.ts", import.meta.url));

describe("authenticated media preview boundary", () => {
  it("uses short-lived signed URLs instead of public Storage URLs", async () => {
    const source = await readFile(queriesPath, "utf8");

    expect(source).toContain('.from("media-public")');
    expect(source).toContain(".createSignedUrl(storageKey, 3600)");
    expect(source).not.toContain("getPublicUrl");
  });
});
