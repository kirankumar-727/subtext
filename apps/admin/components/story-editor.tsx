"use client";
/* eslint-disable @next/next/no-img-element */

import { deriveContentMetrics, MarkdownRenderer } from "@subtext/content";
import "@subtext/content/styles.css";
import { getSupabaseBrowserClient } from "@subtext/supabase/browser";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMediaUploadIntent,
  createSourceInline,
  createTag,
  finalizeMediaUpload,
  requestStoryPublication,
  saveStoryDraft,
} from "@/app/admin/cms-actions";
import {
  AUTOSAVE_DELAY_MS,
  rebaseDraftOntoServer,
  serializeDraftContent,
  shouldRecoverLocalDraft,
} from "@/lib/cms/autosave";
import { SOURCE_TYPE_OPTIONS } from "@/lib/cms/source-types";
import { PublicationReadinessPanel } from "@/components/publication-readiness-panel";
import type { StoryData, WorkspaceReferenceData } from "@/lib/cms/queries";
import type {
  MediaItem,
  SaveState,
  SourceItem,
  SourceType,
  StoryDraftInput,
} from "@/lib/cms/types";

type EditorState = StoryDraftInput;
type DraftConflict = {
  local: EditorState;
  server: EditorState | null;
};

type InspectorTab = "document" | "blocks" | "history";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function saveLabel(state: SaveState, lastSavedAt: Date | null) {
  if (state === "saving") return "Saving…";
  if (state === "unsaved") return "Unsaved changes";
  if (state === "error") return "Save error";
  if (lastSavedAt) {
    return `Saved (${lastSavedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})`;
  }
  return "Saved";
}

export function StoryEditor({
  story,
  reference: initialReference,
}: {
  story: StoryData;
  reference: WorkspaceReferenceData;
}) {
  const revision = story.revision;
  const [reference, setReference] = useState<WorkspaceReferenceData>(initialReference);

  const [draft, setDraft] = useState<EditorState>({
    articleId: story.article.id,
    rowVersion: story.article.row_version,
    title: revision?.title ?? "Untitled",
    slug: story.article.canonical_slug,
    excerpt: revision?.dek ?? "",
    markdown: revision?.body_markdown ?? "# Untitled\n\n",
    pillarId: story.article.primary_pillar_id,
    categoryId: story.article.category_id,
    tagIds: story.tagIds,
    sourceIds: story.sourceIds,
    coverMediaAssetId: story.coverMediaAssetId,
    seoTitle: revision?.seo_title ?? "",
    seoDescription: revision?.seo_description ?? "",
  });

  const [status, setStatus] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "error" | "success">("info");
  const [preview, setPreview] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("document");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const saveAfterConflict = useRef(false);

  // Panel state for Tags, Cover, Sources
  const [tagQuery, setTagQuery] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const [sourceQuery, setSourceQuery] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceType, setNewSourceType] = useState<SourceType>("website");
  const [newSourceAuthor, setNewSourceAuthor] = useState("");
  const [newSourcePublisher, setNewSourcePublisher] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceArchiveUrl, setNewSourceArchiveUrl] = useState("");
  const [newSourceIsbn, setNewSourceIsbn] = useState("");
  const [newSourceDoi, setNewSourceDoi] = useState("");

  const [showMediaUpload, setShowMediaUpload] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "hashing" | "uploading" | "processing" | "complete" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");
  const [uploadAltText, setUploadAltText] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadCredit, setUploadCredit] = useState("");
  const [uploadRights, setUploadRights] = useState("owned");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const latestDraft = useRef(draft);
  const contentSnapshot = useMemo(() => serializeDraftContent(draft), [draft]);
  const metrics = useMemo(() => deriveContentMetrics(draft.markdown), [draft.markdown]);
  const savedSnapshot = useRef(contentSnapshot);
  const storageKey = `subtext:draft:${story.article.id}`;

  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!moreActionsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!moreActionsRef.current?.contains(event.target as Node)) {
        setMoreActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreActionsOpen]);

  const persist = useCallback(async () => {
    if (inFlight.current || conflict) return false;
    inFlight.current = true;
    const payload = latestDraft.current;
    const payloadSnapshot = serializeDraftContent(payload);
    setStatus("saving");

    let result: Awaited<ReturnType<typeof saveStoryDraft>>;
    try {
      result = await saveStoryDraft(payload);
    } catch {
      inFlight.current = false;
      setStatus("error");
      setMessageType("error");
      setMessage("Draft could not be saved to the database. Local changes are preserved.");
      return false;
    }

    inFlight.current = false;

    if (!result.ok) {
      setStatus("error");
      setMessageType("error");
      if (result.code === "conflict") {
        setConflict({ local: payload, server: result.currentDraft });
        setMessage(
          result.currentDraft
            ? "Another session saved this story. Choose whether to reload the server draft or replace it with your local draft."
            : "Another session saved this story. Refresh the page before making further changes.",
        );
      } else {
        setMessage(result.message);
      }
      return false;
    }

    setDraft((current) => ({ ...current, rowVersion: Number(result.value.row_version) }));
    setLastSavedAt(new Date());

    if (serializeDraftContent(latestDraft.current) === payloadSnapshot) {
      savedSnapshot.current = payloadSnapshot;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore localStorage access errors
      }
      setStatus("saved");
      if (messageType !== "success") {
        setMessage("");
      }
    } else {
      setStatus("unsaved");
    }
    return true;
  }, [conflict, messageType, storageKey]);

  // Local recovery on initial load
  useEffect(() => {
    try {
      const local = localStorage.getItem(storageKey);
      if (!local) return;
      const recovered: unknown = JSON.parse(local);

      if (shouldRecoverLocalDraft(recovered, story.article.row_version, story.article.id)) {
        queueMicrotask(() => {
          setDraft(recovered.draft);
          setStatus("unsaved");
          setMessageType("info");
          setMessage("Recovered unsaved local edits from browser cache.");
        });
      }
    } catch {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore
      }
    }
  }, [storageKey, story.article.id, story.article.row_version]);

  // Autosave debounce timer
  useEffect(() => {
    if (conflict || contentSnapshot === savedSnapshot.current) return;
    setStatus((current) => (current === "saving" ? current : "unsaved"));
    try {
      localStorage.setItem(storageKey, JSON.stringify({ draft, baseRowVersion: draft.rowVersion }));
    } catch {
      // Ignore
    }
    const timer = window.setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [conflict, contentSnapshot, draft, persist, storageKey]);

  useEffect(() => {
    if (!saveAfterConflict.current || conflict) return;
    saveAfterConflict.current = false;
    void persist();
  }, [conflict, persist]);

  // Keyboard shortcut: Cmd+S / Ctrl+S
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persist();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [persist]);

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function format(prefix: string, suffix = prefix, placeholder = "text") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.markdown.slice(start, end) || placeholder;
    const markdown = `${draft.markdown.slice(0, start)}${prefix}${selected}${suffix}${draft.markdown.slice(end)}`;
    update("markdown", markdown);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function insertAtCursor(value: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const position = textarea.selectionStart;
    update(
      "markdown",
      `${draft.markdown.slice(0, position)}${value}${draft.markdown.slice(textarea.selectionEnd)}`,
    );
  }

  function reloadServerDraft() {
    if (!conflict?.server) return;
    const serverDraft = conflict.server;
    latestDraft.current = serverDraft;
    setDraft(serverDraft);
    savedSnapshot.current = serializeDraftContent(serverDraft);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore localStorage access errors
    }
    setConflict(null);
    saveAfterConflict.current = false;
    setStatus("saved");
    setMessageType("info");
    setMessage(
      "Loaded the latest server draft. Your local draft was discarded after your explicit choice.",
    );
  }

  function replaceServerWithLocalDraft() {
    if (!conflict?.server) return;
    const rebasedDraft = rebaseDraftOntoServer(latestDraft.current, conflict.server);
    latestDraft.current = rebasedDraft;
    setDraft(rebasedDraft);
    setConflict(null);
    saveAfterConflict.current = true;
    setStatus("unsaved");
    setMessageType("info");
    setMessage(
      "Your local draft was explicitly rebased onto the latest server version and will be saved as a new draft.",
    );
  }

  async function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    setIsCreatingTag(true);
    try {
      const result = await createTag({ name });
      if (result.ok && result.tag) {
        const created = result.tag;
        setReference((prev) => ({
          ...prev,
          tags: prev.tags.some((t) => t.id === created.id) ? prev.tags : [...prev.tags, created],
        }));
        if (!draft.tagIds.includes(created.id)) {
          update("tagIds", [...draft.tagIds, created.id]);
        }
        setNewTagName("");
      }
    } catch {
      setMessageType("error");
      setMessage("Tag could not be created. Check the name and retry.");
    } finally {
      setIsCreatingTag(false);
    }
  }

  async function handleCreateSource(e: React.FormEvent, andCite = false) {
    e.preventDefault();
    const title = newSourceTitle.trim();
    if (!title) return;
    setIsCreatingSource(true);
    try {
      const payload: Parameters<typeof createSourceInline>[0] = {
        title,
        sourceType: newSourceType,
      };
      if (newSourceAuthor.trim()) payload.authorText = newSourceAuthor.trim();
      if (newSourcePublisher.trim()) payload.publisher = newSourcePublisher.trim();
      if (newSourceUrl.trim()) payload.url = newSourceUrl.trim();
      if (newSourceArchiveUrl.trim()) payload.archiveUrl = newSourceArchiveUrl.trim();
      if (newSourceIsbn.trim()) payload.isbn = newSourceIsbn.trim();
      if (newSourceDoi.trim()) payload.doi = newSourceDoi.trim();

      const result = await createSourceInline(payload);
      if (result.ok && result.source) {
        const created = result.source;
        setReference((prev) => ({
          ...prev,
          sources: [created, ...prev.sources.filter((s) => s.id !== created.id)] as SourceItem[],
        }));
        const newIds = draft.sourceIds.includes(created.id)
          ? draft.sourceIds
          : [...draft.sourceIds, created.id];
        update("sourceIds", newIds);

        if (andCite) {
          const citationIndex = newIds.indexOf(created.id);
          insertAtCursor(`[^src-${citationIndex + 1}]`);
        }

        setNewSourceTitle("");
        setNewSourceAuthor("");
        setNewSourcePublisher("");
        setNewSourceUrl("");
        setNewSourceArchiveUrl("");
        setNewSourceIsbn("");
        setNewSourceDoi("");
        setShowAddSource(false);
      }
    } catch {
      setMessageType("error");
      setMessage("Source could not be created. Check the required fields and retry.");
    } finally {
      setIsCreatingSource(false);
    }
  }

  async function handleMediaUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !file.size) {
      setUploadError("Please select an image file.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setUploadError("Choose a JPEG, PNG, WebP, or AVIF image.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadError("Images must be 25 MB or smaller.");
      return;
    }
    if (!uploadAltText.trim()) {
      setUploadError("Alternative text is required for accessibility and publication validation.");
      return;
    }

    setUploadStatus("hashing");
    setUploadError("");

    try {
      const checksumSha256 = hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const uploadPayload: Parameters<typeof createMediaUploadIntent>[0] = {
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
        checksumSha256,
        altText: uploadAltText.trim(),
        rightsStatus: uploadRights,
      };
      if (uploadCaption.trim()) uploadPayload.caption = uploadCaption.trim();
      if (uploadCredit.trim()) uploadPayload.credit = uploadCredit.trim();

      const intent = await createMediaUploadIntent(uploadPayload);

      setUploadStatus("uploading");
      const supabase = getSupabaseBrowserClient();
      const upload = await supabase.storage
        .from("media-originals")
        .uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (upload.error) throw new Error("Original image upload failed. Please retry.");

      setUploadStatus("processing");
      const finalResult = await finalizeMediaUpload(intent.id);

      if (finalResult.ok && finalResult.media) {
        const createdMedia = finalResult.media;
        setReference((prev) => ({
          ...prev,
          media: [
            createdMedia,
            ...prev.media.filter((m) => m.id !== createdMedia.id),
          ] as MediaItem[],
        }));
        update("coverMediaAssetId", createdMedia.id);
        setUploadStatus("complete");
        setShowMediaUpload(false);
        setUploadAltText("");
        setUploadCaption("");
        setUploadCredit("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      setUploadStatus("error");
      setUploadError(
        "Image upload or processing failed. Verify the file and rights metadata, then retry.",
      );
    }
  }

  async function publication(
    action: "publish" | "unpublish" | "rollback",
    targetRevisionId: string | null = null,
  ) {
    if (
      action === "unpublish" &&
      !window.confirm("Unpublish this story? It will no longer be available on the public site.")
    ) {
      return;
    }

    setIsPublishing(true);
    setMessage("");

    // Step 1: Pre-save current draft
    const saved = await persist();
    if (!saved && action !== "unpublish") {
      setIsPublishing(false);
      setMessageType("error");
      setMessage("Please resolve the draft conflict or save error before publishing.");
      return;
    }

    // Step 2: Client-side preflight check
    if (action === "publish") {
      if (!draft.title.trim()) {
        setIsPublishing(false);
        setMessageType("error");
        setMessage("Story title is required for publication.");
        return;
      }
      if (!draft.slug.trim()) {
        setIsPublishing(false);
        setMessageType("error");
        setMessage("Canonical slug is required for publication.");
        return;
      }
      if (!draft.pillarId) {
        setIsPublishing(false);
        setMessageType("error");
        setMessage("An editorial pillar must be selected.");
        return;
      }
      if (draft.coverMediaAssetId) {
        const cover = reference.media.find((m) => m.id === draft.coverMediaAssetId);
        if (cover && !cover.default_alt_text?.trim()) {
          setIsPublishing(false);
          setMessageType("error");
          setMessage("Selected cover image must have descriptive alternative text.");
          return;
        }
      }
    }

    try {
      const result = await requestStoryPublication({
        articleId: draft.articleId,
        action,
        targetRevisionId,
      });

      if (!result.ok) {
        setMessageType("error");
        setMessage(result.message);
      } else {
        setMessageType("success");
        setMessage(
          action === "publish"
            ? "Publication job submitted and worker dispatched. The story will appear publicly momentarily."
            : action === "unpublish"
              ? "Story unpublished. Public routes and search projections removed."
              : "Rollback job submitted.",
        );
      }
    } catch {
      setMessageType("error");
      setMessage("Publication request failed. Review the draft and retry.");
    } finally {
      setIsPublishing(false);
    }
  }

  const categories = useMemo(
    () => reference.categories.filter((category) => category.pillar_id === draft.pillarId),
    [reference.categories, draft.pillarId],
  );

  const filteredTags = useMemo(
    () =>
      reference.tags.filter(
        (tag) =>
          !tagQuery ||
          tag.name.toLowerCase().includes(tagQuery.toLowerCase()) ||
          tag.slug.toLowerCase().includes(tagQuery.toLowerCase()),
      ),
    [reference.tags, tagQuery],
  );

  const filteredSources = useMemo(
    () =>
      reference.sources.filter(
        (source) =>
          !sourceQuery ||
          source.title.toLowerCase().includes(sourceQuery.toLowerCase()) ||
          (source.author_text &&
            source.author_text.toLowerCase().includes(sourceQuery.toLowerCase())),
      ),
    [reference.sources, sourceQuery],
  );

  const selectedCover = useMemo(
    () => reference.media.find((asset) => asset.id === draft.coverMediaAssetId),
    [reference.media, draft.coverMediaAssetId],
  );

  const previewMarkdown = useMemo(() => {
    const definitions = draft.sourceIds
      .map((sourceId, index) => {
        const source = reference.sources.find((item) => item.id === sourceId);
        if (!source || draft.markdown.includes(`[^src-${index + 1}]:`)) return null;
        return `[^src-${index + 1}]: ${[source.author_text, source.title, source.url].filter(Boolean).join(", ")}`;
      })
      .filter(Boolean)
      .join("\n");
    return definitions ? `${draft.markdown}\n\n${definitions}` : draft.markdown;
  }, [draft.markdown, draft.sourceIds, reference.sources]);

  return (
    <main className={`editor-page${focusMode ? " editor-page--focus" : ""}`}>
      <header className="editor-topbar">
        <div className="editor-context">
          <Link className="editor-back" href="/admin/stories">
            <span aria-hidden="true">←</span> Stories
          </Link>
          <span aria-hidden="true" className="editor-breadcrumb-divider">
            /
          </span>
          <span className="editor-breadcrumb-title" title={draft.title}>
            {draft.title || "Untitled story"}
          </span>
        </div>
        <div className="editor-command-meta" aria-label="Draft status and metrics">
          <div className={`save-state save-state--${status}`}>
            <span />
            <span>
              <strong>{saveLabel(status, lastSavedAt)}</strong>
              <small>{lastSavedAt ? "Last saved" : "Ready to save"}</small>
            </span>
          </div>
          <span className="editor-word-count">
            {metrics.wordCount.toLocaleString("en-IN")} words <i aria-hidden="true">·</i>{" "}
            {metrics.readingTimeMinutes} min read
          </span>
        </div>
        <div className="editor-actions">
          <button
            aria-pressed={preview}
            className="editor-action-secondary"
            onClick={() => setPreview((value) => !value)}
            type="button"
          >
            {preview ? "Hide preview" : "Preview"}
          </button>
          <button
            aria-expanded={inspectorOpen}
            className="editor-action-secondary editor-inspector-toggle"
            onClick={() => setInspectorOpen((value) => !value)}
            type="button"
          >
            {inspectorOpen ? "Hide details" : "Story details"}
          </button>
          <button
            className="editor-action-secondary editor-save-button"
            disabled={status === "saving" || Boolean(conflict)}
            onClick={() => void persist()}
            title="Save draft (Ctrl+S / Cmd+S)"
            type="button"
          >
            Save draft
          </button>
          {story.article.published_revision_id ? (
            <button
              className="editor-action-secondary editor-unpublish-button"
              disabled={isPublishing}
              onClick={() => void publication("unpublish")}
              type="button"
            >
              Unpublish
            </button>
          ) : null}
          <button
            className="primary-action editor-publish-button"
            disabled={isPublishing || status === "saving" || Boolean(conflict)}
            onClick={() => void publication("publish")}
            type="button"
          >
            {isPublishing
              ? "Publishing…"
              : story.article.published_revision_id
                ? "Republish"
                : "Publish"}
          </button>
          <div className="editor-more-actions" ref={moreActionsRef}>
            <button
              aria-expanded={moreActionsOpen}
              aria-haspopup="menu"
              className="editor-action-secondary editor-more-button"
              onClick={() => setMoreActionsOpen((open) => !open)}
              type="button"
            >
              More <span aria-hidden="true">⋯</span>
            </button>
            {moreActionsOpen ? (
              <div className="editor-more-menu" role="menu">
                <button
                  onClick={() => {
                    setFocusMode((value) => !value);
                    setMoreActionsOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {focusMode ? "Exit focus mode" : "Enter focus mode"}
                </button>
                <button
                  onClick={() => {
                    setInspectorTab("history");
                    setInspectorOpen(true);
                    setMoreActionsOpen(false);
                    window.requestAnimationFrame(() =>
                      document.querySelector("#editor-inspector")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      }),
                    );
                  }}
                  role="menuitem"
                  type="button"
                >
                  Open revision history
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {message ? (
        <div
          aria-live="polite"
          className={`editor-message editor-message--${messageType}`}
          role={messageType === "error" ? "alert" : "status"}
        >
          <span>{message}</span>
          {status === "error" && !conflict ? (
            <button className="save-retry-btn" onClick={() => void persist()} type="button">
              Retry Save
            </button>
          ) : null}
        </div>
      ) : null}

      {conflict ? (
        <section className="editor-conflict" aria-label="Draft conflict" role="alert">
          <div>
            <strong>Draft conflict requires a decision</strong>
            <p>
              Your local changes are preserved, but the server has a newer draft. Choose a safe
              action before saving or publishing again.
            </p>
          </div>
          {conflict.server ? (
            <div className="editor-conflict__comparison">
              <div>
                <span>Server version {conflict.server.rowVersion}</span>
                <strong>{conflict.server.title}</strong>
                <p>{conflict.server.markdown.slice(0, 240)}</p>
              </div>
              <div>
                <span>Your local version based on {conflict.local.rowVersion}</span>
                <strong>{conflict.local.title}</strong>
                <p>{conflict.local.markdown.slice(0, 240)}</p>
              </div>
            </div>
          ) : (
            <p>The current server draft could not be loaded. Refresh this page to reconcile it.</p>
          )}
          <p>
            Reloading discards the local version. Replacing keeps your local fields and overwrites
            the newer server draft after a fresh row-version check.
          </p>
          <div className="editor-conflict__actions">
            <button disabled={!conflict.server} onClick={reloadServerDraft} type="button">
              Reload server draft
            </button>
            <button
              className="primary-action"
              disabled={!conflict.server}
              onClick={replaceServerWithLocalDraft}
              type="button"
            >
              Replace server with my local draft
            </button>
          </div>
        </section>
      ) : null}

      <div className={`editor-grid ${preview ? "editor-grid--preview" : ""}`}>
        <section className="editor-compose">
          <input
            aria-label="Story title"
            className="editor-title"
            maxLength={180}
            onChange={(event) => update("title", event.target.value)}
            placeholder="Story title"
            value={draft.title}
          />
          <textarea
            aria-label="Story excerpt"
            className="editor-excerpt"
            maxLength={360}
            onChange={(event) => update("excerpt", event.target.value)}
            placeholder="Dek / Excerpt (sub-headline that sets context)"
            rows={2}
            value={draft.excerpt}
          />
          <div className="format-toolbar" aria-label="Markdown formatting">
            <button onClick={() => format("**", "**", "bold")} title="Bold" type="button">
              <strong>B</strong>
            </button>
            <button onClick={() => format("_", "_", "italic")} title="Italic" type="button">
              <em>I</em>
            </button>
            <button onClick={() => format("## ", "", "Heading")} title="Heading 2" type="button">
              H2
            </button>
            <button
              onClick={() => format("### ", "", "Subheading")}
              title="Heading 3"
              type="button"
            >
              H3
            </button>
            <button
              onClick={() => format("[", "](https://)", "link text")}
              title="Link"
              type="button"
            >
              Link
            </button>
            <button onClick={() => format("> ", "", "Quote")} title="Blockquote" type="button">
              Quote
            </button>
            <button
              onClick={() => format(":::callout\n", "\n:::", "Callout note")}
              title="Callout Box"
              type="button"
            >
              Callout
            </button>
          </div>
          <textarea
            aria-label="Story Markdown"
            className="markdown-editor"
            onChange={(event) => update("markdown", event.target.value)}
            ref={textareaRef}
            spellCheck
            value={draft.markdown}
          />
        </section>

        {preview ? (
          <section className="editor-preview" aria-label="Article preview">
            <div className="preview-frame">
              <header className="preview-publication-head">
                <div>
                  <span className="preview-publication-name">Subtext</span>
                  <span className="preview-publication-label">Live article preview</span>
                </div>
                <span className="preview-draft-badge">Draft</span>
              </header>
              <div className="preview-kicker">
                {reference.pillars.find((pillar) => pillar.id === draft.pillarId)?.name}
                {draft.categoryId
                  ? ` / ${categories.find((category) => category.id === draft.categoryId)?.name ?? ""}`
                  : ""}
              </div>
              <h1>{draft.title}</h1>
              {draft.excerpt ? <p className="preview-dek">{draft.excerpt}</p> : null}
              <div className="preview-article-meta">
                <span>Editorial preview</span>
                <span>
                  {metrics.wordCount.toLocaleString("en-IN")} words · {metrics.readingTimeMinutes}{" "}
                  min read
                </span>
              </div>
              {selectedCover?.publicUrl ? (
                <figure className="preview-cover">
                  <img alt={selectedCover.default_alt_text ?? ""} src={selectedCover.publicUrl} />
                  {selectedCover.default_caption ? (
                    <figcaption>{selectedCover.default_caption}</figcaption>
                  ) : null}
                </figure>
              ) : null}
              <div className="preview-body">
                <MarkdownRenderer markdown={previewMarkdown} />
              </div>
            </div>
          </section>
        ) : null}

        <aside
          className={`editor-metadata${inspectorOpen ? " editor-metadata--open" : ""}`}
          id="editor-inspector"
        >
          <div className="editor-inspector__header">
            <div>
              <span className="inspector-eyebrow">Story controls</span>
              <h2>Inspector</h2>
            </div>
            <span className="inspector-row-version">v{draft.rowVersion}</span>
          </div>
          <div aria-label="Inspector sections" className="editor-inspector-tabs" role="tablist">
            <button
              aria-selected={inspectorTab === "document"}
              className={inspectorTab === "document" ? "is-active" : ""}
              onClick={() => setInspectorTab("document")}
              role="tab"
              type="button"
            >
              Document
            </button>
            <button
              aria-selected={inspectorTab === "blocks"}
              className={inspectorTab === "blocks" ? "is-active" : ""}
              onClick={() => setInspectorTab("blocks")}
              role="tab"
              type="button"
            >
              Blocks
            </button>
            <button
              aria-selected={inspectorTab === "history"}
              className={inspectorTab === "history" ? "is-active" : ""}
              onClick={() => setInspectorTab("history")}
              role="tab"
              type="button"
            >
              History
            </button>
          </div>
          {inspectorTab === "document" ? (
            <div className="inspector-tab-panel">
              <div className="inspector-status-grid">
                <div>
                  <span>Status</span>
                  <strong className={`status-chip status-chip--${story.article.status}`}>
                    {story.article.status.replaceAll("_", " ")}
                  </strong>
                </div>
                <div>
                  <span>Visibility</span>
                  <strong>
                    {story.article.published_revision_id ? "Public" : "Private draft"}
                  </strong>
                </div>
                <div>
                  <span>Publish timing</span>
                  <strong>
                    {story.article.scheduled_for
                      ? new Date(story.article.scheduled_for).toLocaleString("en-IN")
                      : story.article.last_published_at
                        ? new Date(story.article.last_published_at).toLocaleDateString("en-IN")
                        : "Not scheduled"}
                  </strong>
                </div>
              </div>
              <p className="inspector-readonly-note">
                Publication status and timing are controlled by the existing publishing workflow.
              </p>
              <PublicationReadinessPanel
                draft={draft}
                reference={reference}
                saveState={status}
                story={story}
              />
              {/* Story Settings */}
              <details open>
                <summary>Document details</summary>
                <label>
                  Slug
                  <input
                    onChange={(event) => update("slug", event.target.value)}
                    value={draft.slug}
                  />
                </label>
                <label>
                  Pillar
                  <select
                    onChange={(event) => {
                      update("pillarId", event.target.value);
                      update("categoryId", null);
                    }}
                    value={draft.pillarId}
                  >
                    {reference.pillars.map((pillar) => (
                      <option key={pillar.id} value={pillar.id}>
                        {pillar.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    onChange={(event) => update("categoryId", event.target.value || null)}
                    value={draft.categoryId ?? ""}
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Excerpt / dek
                  <textarea
                    maxLength={360}
                    onChange={(event) => update("excerpt", event.target.value)}
                    placeholder="A short line of context for the published story"
                    rows={4}
                    value={draft.excerpt}
                  />
                </label>
              </details>

              {/* Tags Panel */}
              <details open>
                <summary>Tags ({draft.tagIds.length})</summary>
                <div className="panel-controls">
                  <input
                    className="panel-search"
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Search tags…"
                    value={tagQuery}
                  />
                </div>
                <div className="metadata-checklist">
                  {filteredTags.map((tag) => (
                    <label key={tag.id}>
                      <input
                        checked={draft.tagIds.includes(tag.id)}
                        onChange={(event) =>
                          update(
                            "tagIds",
                            event.target.checked
                              ? [...draft.tagIds, tag.id]
                              : draft.tagIds.filter((id) => id !== tag.id),
                          )
                        }
                        type="checkbox"
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                  {!filteredTags.length ? (
                    <p className="field-hint">No existing tags match &apos;{tagQuery}&apos;</p>
                  ) : null}
                </div>

                {/* Inline Tag Creator */}
                <form className="inline-creator" onSubmit={handleCreateTag}>
                  <input
                    disabled={isCreatingTag}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Create new tag…"
                    value={newTagName}
                  />
                  <button disabled={isCreatingTag || !newTagName.trim()} type="submit">
                    {isCreatingTag ? "Adding…" : "+ Add"}
                  </button>
                </form>
              </details>

              {/* Cover Image Panel */}
              <details open>
                <summary>Cover Image {selectedCover ? "✓" : ""}</summary>
                {selectedCover ? (
                  <div className="selected-cover-card">
                    {selectedCover.publicUrl ? (
                      <img
                        alt={selectedCover.default_alt_text ?? ""}
                        src={selectedCover.publicUrl}
                      />
                    ) : null}
                    <div className="cover-card-info">
                      <strong>{selectedCover.original_filename}</strong>
                      <p>{selectedCover.default_alt_text || "No alt text"}</p>
                      <button onClick={() => update("coverMediaAssetId", null)} type="button">
                        Remove Cover
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="field-hint">No cover image selected.</p>
                )}

                <div className="panel-actions-row">
                  <button onClick={() => setShowMediaUpload((v) => !v)} type="button">
                    {showMediaUpload ? "Close Upload" : "+ Upload New Image"}
                  </button>
                </div>

                {showMediaUpload ? (
                  <form className="inline-upload-form" onSubmit={handleMediaUpload}>
                    <h4>Upload Cover Image</h4>
                    <label>
                      File
                      <input
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        ref={fileInputRef}
                        required
                        type="file"
                      />
                    </label>
                    <label>
                      Alt Text (Required for publication)
                      <input
                        onChange={(e) => setUploadAltText(e.target.value)}
                        placeholder="Descriptive text for accessibility"
                        required
                        value={uploadAltText}
                      />
                    </label>
                    <label>
                      Caption
                      <input
                        onChange={(e) => setUploadCaption(e.target.value)}
                        placeholder="Photo caption"
                        value={uploadCaption}
                      />
                    </label>
                    <label>
                      Credit
                      <input
                        onChange={(e) => setUploadCredit(e.target.value)}
                        placeholder="Photo credit / source"
                        value={uploadCredit}
                      />
                    </label>
                    <label>
                      Rights Status
                      <select
                        onChange={(e) => setUploadRights(e.target.value)}
                        value={uploadRights}
                      >
                        <option value="owned">Owned</option>
                        <option value="licensed">Licensed</option>
                        <option value="public_domain">Public domain</option>
                        <option value="creative_commons">Creative Commons</option>
                        <option value="permission_granted">Permission granted</option>
                      </select>
                    </label>

                    {uploadError ? <p className="upload-error">{uploadError}</p> : null}

                    <button
                      className="primary-action"
                      disabled={
                        uploadStatus === "hashing" ||
                        uploadStatus === "uploading" ||
                        uploadStatus === "processing"
                      }
                      type="submit"
                    >
                      {uploadStatus === "idle"
                        ? "Upload & Set as Cover"
                        : uploadStatus === "hashing"
                          ? "Hashing image…"
                          : uploadStatus === "uploading"
                            ? "Uploading original…"
                            : uploadStatus === "processing"
                              ? "Generating derivatives…"
                              : "Upload & Set"}
                    </button>
                  </form>
                ) : null}

                <h4 className="sub-heading">Choose from Media Library</h4>
                <div className="media-picker">
                  <button
                    className={!draft.coverMediaAssetId ? "is-selected" : ""}
                    onClick={() => update("coverMediaAssetId", null)}
                    type="button"
                  >
                    None
                  </button>
                  {reference.media.map((asset) => {
                    const isSelectable = asset.processing_status === "ready";
                    return (
                      <button
                        className={`${draft.coverMediaAssetId === asset.id ? "is-selected" : ""}${!isSelectable ? " is-unavailable" : ""}`}
                        disabled={!isSelectable}
                        key={asset.id}
                        onClick={() => update("coverMediaAssetId", asset.id)}
                        title={
                          isSelectable
                            ? asset.original_filename
                            : `${asset.original_filename} is ${asset.processing_status}; wait until it is ready`
                        }
                        type="button"
                      >
                        {asset.publicUrl ? (
                          <img alt={asset.default_alt_text ?? ""} src={asset.publicUrl} />
                        ) : null}
                        <span>{asset.original_filename}</span>
                        {!isSelectable ? <small>{asset.processing_status}</small> : null}
                      </button>
                    );
                  })}
                </div>

                {selectedCover?.publicUrl ? (
                  <button
                    className="insert-inline-btn"
                    onClick={() =>
                      insertAtCursor(
                        `\n![${selectedCover.default_alt_text ?? ""}](${selectedCover.publicUrl} "${selectedCover.default_caption ?? ""}")\n`,
                      )
                    }
                    type="button"
                  >
                    Insert cover image inline in text
                  </button>
                ) : null}
              </details>

              {/* Sources Panel */}
              <details open>
                <summary>Sources & Citations ({draft.sourceIds.length})</summary>
                <div className="panel-controls">
                  <input
                    className="panel-search"
                    onChange={(e) => setSourceQuery(e.target.value)}
                    placeholder="Search sources…"
                    value={sourceQuery}
                  />
                  <button onClick={() => setShowAddSource((v) => !v)} type="button">
                    {showAddSource ? "Cancel" : "+ Add Source"}
                  </button>
                </div>

                {showAddSource ? (
                  <form
                    className="inline-source-form"
                    onSubmit={(e) => handleCreateSource(e, true)}
                  >
                    <h4>Add Research Source</h4>
                    <label>
                      Type
                      <select
                        onChange={(e) => setNewSourceType(e.target.value as SourceType)}
                        value={newSourceType}
                      >
                        {SOURCE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Title (Required)
                      <input
                        onChange={(e) => setNewSourceTitle(e.target.value)}
                        placeholder="Document or article title"
                        required
                        value={newSourceTitle}
                      />
                    </label>
                    <label>
                      Author / Organization
                      <input
                        onChange={(e) => setNewSourceAuthor(e.target.value)}
                        placeholder="e.g. John Doe / Nature"
                        value={newSourceAuthor}
                      />
                    </label>
                    <label>
                      Publisher
                      <input
                        onChange={(e) => setNewSourcePublisher(e.target.value)}
                        placeholder="e.g. Oxford University Press"
                        value={newSourcePublisher}
                      />
                    </label>
                    <label>
                      URL
                      <input
                        onChange={(e) => setNewSourceUrl(e.target.value)}
                        placeholder="https://..."
                        type="url"
                        value={newSourceUrl}
                      />
                    </label>
                    <label>
                      Archive URL
                      <input
                        onChange={(e) => setNewSourceArchiveUrl(e.target.value)}
                        placeholder="https://archive..."
                        type="url"
                        value={newSourceArchiveUrl}
                      />
                    </label>
                    <label>
                      ISBN
                      <input
                        onChange={(e) => setNewSourceIsbn(e.target.value)}
                        placeholder="Optional book identifier"
                        value={newSourceIsbn}
                      />
                    </label>
                    <label>
                      DOI
                      <input
                        onChange={(e) => setNewSourceDoi(e.target.value)}
                        placeholder="10.…"
                        value={newSourceDoi}
                      />
                    </label>
                    <div className="source-form-actions">
                      <button
                        className="primary-action"
                        disabled={isCreatingSource || !newSourceTitle.trim()}
                        type="submit"
                      >
                        {isCreatingSource ? "Adding…" : "Add & Cite at Cursor"}
                      </button>
                      <button
                        disabled={isCreatingSource || !newSourceTitle.trim()}
                        onClick={(e) => handleCreateSource(e, false)}
                        type="button"
                      >
                        Add to Story
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="metadata-checklist">
                  {filteredSources.map((source) => (
                    <label key={source.id}>
                      <input
                        checked={draft.sourceIds.includes(source.id)}
                        onChange={(event) =>
                          update(
                            "sourceIds",
                            event.target.checked
                              ? [...draft.sourceIds, source.id]
                              : draft.sourceIds.filter((id) => id !== source.id),
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="source-title-text" title={source.title}>
                          {source.title}
                        </span>
                        <button
                          className="cite-btn"
                          onClick={(event) => {
                            event.preventDefault();
                            const selectedIndex = draft.sourceIds.indexOf(source.id);
                            const citationIndex =
                              selectedIndex >= 0 ? selectedIndex : draft.sourceIds.length;
                            if (selectedIndex < 0) {
                              update("sourceIds", [...draft.sourceIds, source.id]);
                            }
                            insertAtCursor(`[^src-${citationIndex + 1}]`);
                          }}
                          title="Insert footnote citation tag at cursor"
                          type="button"
                        >
                          Cite
                        </button>
                      </span>
                    </label>
                  ))}
                  {!filteredSources.length ? (
                    <p className="field-hint">No sources match &apos;{sourceQuery}&apos;</p>
                  ) : null}
                </div>
              </details>

              {/* SEO Metadata */}
              <details>
                <summary>SEO & Social Metadata</summary>
                <label>
                  SEO Title
                  <input
                    maxLength={120}
                    onChange={(event) => update("seoTitle", event.target.value)}
                    placeholder={draft.title}
                    value={draft.seoTitle}
                  />
                </label>
                <label>
                  SEO Description
                  <textarea
                    maxLength={320}
                    onChange={(event) => update("seoDescription", event.target.value)}
                    placeholder={draft.excerpt || "Meta description for search indexing…"}
                    rows={4}
                    value={draft.seoDescription}
                  />
                </label>
                <p className="field-hint">Canonical Path: {story.article.canonical_path}</p>
              </details>
            </div>
          ) : inspectorTab === "blocks" ? (
            <div className="inspector-tab-panel inspector-blocks-panel">
              <div className="inspector-panel-intro">
                <span className="inspector-eyebrow">Compose with intent</span>
                <h3>Writing blocks</h3>
                <p>Insert Markdown patterns without leaving the writing surface.</p>
              </div>
              <div className="inspector-block-grid">
                <button onClick={() => format("## ", "", "Section heading")} type="button">
                  <strong>Heading</strong>
                  <span>##</span>
                </button>
                <button onClick={() => format("> ", "", "A considered thought")} type="button">
                  <strong>Quote</strong>
                  <span>Quote</span>
                </button>
                <button
                  onClick={() => format(":::callout\n", "\n:::", "Context worth pausing on")}
                  type="button"
                >
                  <strong>Callout</strong>
                  <span>Note</span>
                </button>
                <button onClick={() => format("- ", "", "List item")} type="button">
                  <strong>List</strong>
                  <span>—</span>
                </button>
              </div>
              <div className="inspector-outline">
                <div className="inspector-section-heading">
                  <span>Content outline</span>
                  <span>{metrics.wordCount.toLocaleString("en-IN")} words</span>
                </div>
                {draft.markdown.split(/\r?\n/).filter((line) => /^#{1,3}\s/.test(line)).length ? (
                  <ol>
                    {draft.markdown
                      .split(/\r?\n/)
                      .filter((line) => /^#{1,3}\s/.test(line))
                      .map((line, index) => (
                        <li
                          className={`outline-level-${line.match(/^#+/)?.[0].length ?? 1}`}
                          key={`${line}-${index}`}
                        >
                          {line.replace(/^#{1,3}\s+/, "")}
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="field-hint">Add a heading to give this story a clear rhythm.</p>
                )}
              </div>
              <div className="inspector-metric-row">
                <div>
                  <span>Reading time</span>
                  <strong>{metrics.readingTimeMinutes} min</strong>
                </div>
                <div>
                  <span>Markdown</span>
                  <strong>Live</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="inspector-tab-panel inspector-history-panel">
              <div className="inspector-panel-intro">
                <span className="inspector-eyebrow">A record of the work</span>
                <h3>Revision history</h3>
                <p>Every saved revision stays available for the existing rollback workflow.</p>
              </div>
              {/* Version History */}
              <details>
                <summary>Revision History ({story.revisions.length})</summary>
                <ol className="revision-list">
                  {story.revisions.map((item) => (
                    <li key={item.id}>
                      <span>
                        v{item.revision_number} · {item.revision_kind}
                      </span>
                      <time>{new Date(item.created_at).toLocaleString("en-IN")}</time>
                      {story.article.published_revision_id &&
                      item.id !== story.article.published_revision_id ? (
                        <button
                          disabled={isPublishing}
                          onClick={() => void publication("rollback", item.id)}
                          type="button"
                        >
                          Rollback to this version
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </details>
              <div className="inspector-jobs">
                <div className="inspector-section-heading">
                  <span>Publication jobs</span>
                  <span>{story.jobs.length}</span>
                </div>
                {story.jobs.length ? (
                  <ul>
                    {story.jobs.map((job) => (
                      <li key={job.id}>
                        <span>{job.action.replaceAll("_", " ")}</span>
                        <span>{job.status.replaceAll("_", " ")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="field-hint">No publication jobs for this story.</p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
