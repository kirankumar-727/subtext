"use client";
/* eslint-disable @next/next/no-img-element */

import { MarkdownRenderer } from "@subtext/content";
import "@subtext/content/styles.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestStoryPublication, saveStoryDraft } from "@/app/admin/cms-actions";
import {
  AUTOSAVE_DELAY_MS,
  serializeDraftContent,
  shouldRecoverLocalDraft,
} from "@/lib/cms/autosave";
import type { StoryData, WorkspaceReferenceData } from "@/lib/cms/queries";
import type { SaveState, StoryDraftInput } from "@/lib/cms/types";

type EditorState = StoryDraftInput;

function saveLabel(state: SaveState) {
  return {
    idle: "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    saved: "Saved",
    error: "Error",
  }[state];
}

export function StoryEditor({
  story,
  reference,
}: {
  story: StoryData;
  reference: WorkspaceReferenceData;
}) {
  const revision = story.revision;
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
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const latestDraft = useRef(draft);
  const contentSnapshot = useMemo(() => serializeDraftContent(draft), [draft]);
  const savedSnapshot = useRef(contentSnapshot);
  const storageKey = `subtext:draft:${story.article.id}`;

  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);

  const persist = useCallback(async () => {
    if (inFlight.current) return false;
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
      setMessage("Draft could not be saved. Local changes are preserved.");
      return false;
    }
    inFlight.current = false;
    if (!result.ok) {
      setStatus("error");
      setMessage(result.message);
      return false;
    }
    setDraft((current) => ({ ...current, rowVersion: result.value.row_version }));
    if (serializeDraftContent(latestDraft.current) === payloadSnapshot) {
      savedSnapshot.current = payloadSnapshot;
      localStorage.removeItem(storageKey);
      setStatus("saved");
      setMessage("");
    } else {
      setStatus("unsaved");
    }
    return true;
  }, [storageKey]);

  useEffect(() => {
    const local = localStorage.getItem(storageKey);
    if (!local) return;
    try {
      const recovered = JSON.parse(local) as { draft: EditorState; baseRowVersion: number };
      if (shouldRecoverLocalDraft(recovered, story.article.row_version)) {
        queueMicrotask(() => {
          setDraft(recovered.draft);
          setStatus("unsaved");
          setMessage("Recovered unsaved local changes.");
        });
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, story.article.row_version]);

  useEffect(() => {
    if (contentSnapshot === savedSnapshot.current) return;
    setStatus((current) => (current === "saving" ? current : "unsaved"));
    localStorage.setItem(storageKey, JSON.stringify({ draft, baseRowVersion: draft.rowVersion }));
    const timer = window.setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [contentSnapshot, draft, persist, storageKey]);

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

  async function publication(
    action: "publish" | "unpublish" | "rollback",
    targetRevisionId: string | null = null,
  ) {
    if (!(await persist())) return;
    const result = await requestStoryPublication({
      articleId: draft.articleId,
      action,
      targetRevisionId,
    });
    setMessage(result.ok ? "Publication request queued." : result.message);
  }

  const categories = reference.categories.filter(
    (category) => category.pillar_id === draft.pillarId,
  );
  const selectedCover = reference.media.find((asset) => asset.id === draft.coverMediaAssetId);
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
    <main className="editor-page">
      <header className="editor-topbar">
        <Link href="/admin/stories">← Stories</Link>
        <div className={`save-state save-state--${status}`}>
          <span />
          {saveLabel(status)}
        </div>
        <div className="editor-actions">
          <button onClick={() => setPreview((value) => !value)} type="button">
            {preview ? "Hide preview" : "Preview"}
          </button>
          {story.article.published_revision_id ? (
            <button onClick={() => void publication("unpublish")} type="button">
              Unpublish
            </button>
          ) : null}
          <button
            className="primary-action"
            onClick={() => void publication("publish")}
            type="button"
          >
            Publish
          </button>
        </div>
      </header>

      {message ? (
        <p className="editor-message" role="status">
          {message}
        </p>
      ) : null}

      <div className={`editor-grid ${preview ? "editor-grid--preview" : ""}`}>
        <section className="editor-compose">
          <input
            className="editor-title"
            maxLength={180}
            onChange={(event) => update("title", event.target.value)}
            placeholder="Story title"
            value={draft.title}
          />
          <textarea
            className="editor-excerpt"
            maxLength={360}
            onChange={(event) => update("excerpt", event.target.value)}
            placeholder="Excerpt"
            rows={2}
            value={draft.excerpt}
          />
          <div className="format-toolbar" aria-label="Markdown formatting">
            <button onClick={() => format("**", "**", "bold")} type="button">
              <strong>B</strong>
            </button>
            <button onClick={() => format("_", "_", "italic")} type="button">
              <em>I</em>
            </button>
            <button onClick={() => format("## ", "", "Heading")} type="button">
              H2
            </button>
            <button onClick={() => format("[", "](https://)", "link text")} type="button">
              Link
            </button>
            <button onClick={() => format("> ", "", "Quote")} type="button">
              Quote
            </button>
            <button onClick={() => format(":::callout\n", "\n:::", "Note")} type="button">
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
            <div className="preview-kicker">
              {reference.pillars.find((pillar) => pillar.id === draft.pillarId)?.name}
            </div>
            <h1>{draft.title}</h1>
            {draft.excerpt ? <p className="preview-dek">{draft.excerpt}</p> : null}
            {selectedCover?.publicUrl ? (
              <figure>
                <img alt={selectedCover.default_alt_text ?? ""} src={selectedCover.publicUrl} />
                {selectedCover.default_caption ? (
                  <figcaption>{selectedCover.default_caption}</figcaption>
                ) : null}
              </figure>
            ) : null}
            <MarkdownRenderer markdown={previewMarkdown} />
          </section>
        ) : null}

        <aside className="editor-metadata">
          <details open>
            <summary>Story</summary>
            <label>
              Slug
              <input onChange={(event) => update("slug", event.target.value)} value={draft.slug} />
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
          </details>
          <details>
            <summary>Tags</summary>
            <div className="metadata-checklist">
              {reference.tags.map((tag) => (
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
                  {tag.name}
                </label>
              ))}
            </div>
          </details>
          <details>
            <summary>Cover image</summary>
            <div className="media-picker">
              <button
                className={!draft.coverMediaAssetId ? "is-selected" : ""}
                onClick={() => update("coverMediaAssetId", null)}
                type="button"
              >
                No cover
              </button>
              {reference.media.map((asset) => (
                <button
                  className={draft.coverMediaAssetId === asset.id ? "is-selected" : ""}
                  key={asset.id}
                  onClick={() => update("coverMediaAssetId", asset.id)}
                  type="button"
                >
                  {asset.publicUrl ? (
                    <img alt={asset.default_alt_text ?? ""} src={asset.publicUrl} />
                  ) : null}
                  <span>{asset.original_filename}</span>
                </button>
              ))}
            </div>
            {selectedCover?.publicUrl ? (
              <button
                onClick={() =>
                  insertAtCursor(
                    `\n![${selectedCover.default_alt_text ?? ""}](${selectedCover.publicUrl} "${selectedCover.default_caption ?? ""}")\n`,
                  )
                }
                type="button"
              >
                Insert cover inline
              </button>
            ) : null}
          </details>
          <details>
            <summary>Sources</summary>
            <div className="metadata-checklist">
              {reference.sources.map((source) => (
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
                    {source.title}
                    <button
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
                      type="button"
                    >
                      Cite
                    </button>
                  </span>
                </label>
              ))}
            </div>
          </details>
          <details>
            <summary>SEO</summary>
            <label>
              SEO title
              <input
                maxLength={120}
                onChange={(event) => update("seoTitle", event.target.value)}
                value={draft.seoTitle}
              />
            </label>
            <label>
              SEO description
              <textarea
                maxLength={320}
                onChange={(event) => update("seoDescription", event.target.value)}
                rows={4}
                value={draft.seoDescription}
              />
            </label>
            <p className="field-hint">Canonical: {story.article.canonical_path}</p>
          </details>
          <details>
            <summary>History</summary>
            <ol className="revision-list">
              {story.revisions.map((item) => (
                <li key={item.id}>
                  <span>
                    v{item.revision_number} · {item.revision_kind}
                  </span>
                  <time>{new Date(item.created_at).toLocaleString("en-IN")}</time>
                  {story.article.published_revision_id &&
                  item.id !== story.article.published_revision_id ? (
                    <button onClick={() => void publication("rollback", item.id)} type="button">
                      Rollback
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          </details>
        </aside>
      </div>
    </main>
  );
}
