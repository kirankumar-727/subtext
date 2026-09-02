const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function stripPrivateCitationSyntax(markdown: string, publicCitationKeys: Iterable<string>) {
  const publicKeys = new Set(publicCitationKeys);
  const withoutDefinitions = markdown.replace(
    /^[ \t]{0,3}\[\^([^\]]+)\]:[^\n]*(?:\n(?:[ \t]{4}|\t).*)*/gm,
    "",
  );

  return (
    withoutDefinitions
      // Inline GFM footnotes contain their own text and have no normalized source
      // row, so do not allow them to become an unreviewed public citation.
      .replace(/\^\[[^\]]*\]/g, "")
      .replace(/\[\^([^\]]+)\]/g, (reference, key: string) =>
        publicKeys.has(key) ? reference : "",
      )
  );
}

export function isSafePublicReference(value: string, siteUrl = "https://subtext.media") {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return new RegExp(`^/api/media/${UUID_PATTERN}(?:[?#].*)?$`, "i").test(value);
  }

  try {
    const parsed = new URL(value);
    const publicOrigin = new URL(siteUrl).origin;
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (decodedPath.includes("..")) return false;
    if (/^\/api\/media\//i.test(decodedPath)) {
      return (
        parsed.origin === publicOrigin &&
        new RegExp(`^/api/media/${UUID_PATTERN}$`, "i").test(decodedPath)
      );
    }

    const storagePath = `${parsed.hostname}${decodedPath}`.toLowerCase();
    return !(
      storagePath.includes("/storage/v1/") ||
      storagePath.includes("media-public") ||
      storagePath.includes("media-originals")
    );
  } catch {
    return false;
  }
}

/**
 * Remove media links that bypass the controlled public media route. External
 * editorial images remain supported, but neither Supabase Storage URLs nor
 * arbitrary /api/media paths are allowed to become public article markup.
 */
export function sanitizePublicMediaReferences(markdown: string, siteUrl = "https://subtext.media") {
  const linkPattern = /(!?)(\[[^\]]*\]\()(?:(<[^>]*>)|([^\s)]+))([^)]*\))/g;
  const withoutUnsafeLinks = markdown.replace(
    linkPattern,
    (full, imageMarker, prefix, wrapped, plain) => {
      const destination = (wrapped ?? plain).replace(/^<|>$/g, "");
      if (isSafePublicReference(destination, siteUrl)) return full;
      // Keep ordinary link text readable, but never leave a private Storage
      // path or an arbitrary media endpoint in the public HTML.
      return imageMarker ? "" : prefix.slice(0, -1);
    },
  );
  const storageTokenPattern =
    /(?:https?:\/\/|\/storage\/v1\/|(?:media-public|media-originals)\/)[^\s<>)]+/gi;
  return withoutUnsafeLinks.replace(storageTokenPattern, (value) =>
    isSafePublicReference(value, siteUrl) ? value : "",
  );
}

export function sanitizePublicMarkdown(
  markdown: string,
  publicCitationKeys: Iterable<string>,
  siteUrl = "https://subtext.media",
) {
  return sanitizePublicMediaReferences(
    stripPrivateCitationSyntax(markdown, publicCitationKeys),
    siteUrl,
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Kept as a focused alias for callers and tests that only need the citation
 * boundary. Public article rendering uses sanitizePublicMarkdown so media and
 * citation boundaries are applied together.
 */
export function sanitizePublicCitationMarkdown(
  markdown: string,
  publicCitationKeys: Iterable<string>,
) {
  return stripPrivateCitationSyntax(markdown, publicCitationKeys)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
