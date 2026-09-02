"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createSource } from "@/app/admin/cms-actions";
import { SOURCE_TYPE_OPTIONS, sourceTypeLabel } from "@/lib/cms/source-types";
import type { SourceItem, SourceType } from "@/lib/cms/types";
import { WorkspaceSheet } from "@/components/workspace-sheet";

type SourceLibraryProps = Readonly<{
  sources: SourceItem[];
}>;

type FormState = "idle" | "saving" | "saved" | "error";

function sourceSearchText(source: SourceItem) {
  return [
    source.title,
    source.author_text,
    source.publisher,
    source.url,
    source.archive_url,
    source.isbn,
    source.doi,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function SourceLibrary({ sources }: SourceLibraryProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SourceType | "">("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const filteredSources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sources.filter(
      (source) =>
        (!type || source.source_type === type) &&
        (!normalizedQuery || sourceSearchText(source).includes(normalizedQuery)),
    );
  }, [query, sources, type]);

  function openSheet() {
    setError("");
    setFormState("idle");
    setSheetOpen(true);
  }

  function closeSheet() {
    if (formState === "saving") return;
    setSheetOpen(false);
  }

  function submitSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setFormState("saving");
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        await createSource(formData);
        setFormState("saved");
        formRef.current?.reset();
        router.refresh();
      } catch {
        setFormState("error");
        setError("Source could not be added. Check the fields and try again.");
      }
    });
  }

  return (
    <section className="source-library" aria-label="Research library">
      <div className="source-library__toolbar">
        <div>
          <span className="workspace-section-kicker">Research library</span>
          <p>
            {sources.length
              ? `${sources.length} source${sources.length === 1 ? "" : "s"} in your reference shelf`
              : "A considered shelf for the material behind the work"}
          </p>
        </div>
        <button className="primary-action" onClick={openSheet} type="button">
          <span aria-hidden="true">+</span> Add source
        </button>
      </div>

      <div className="source-library__filters">
        <label>
          <span>Search research</span>
          <input
            aria-label="Search research sources"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, author, DOI…"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>Source type</span>
          <select
            aria-label="Filter sources by type"
            onChange={(event) => setType(event.target.value as SourceType | "")}
            value={type}
          >
            <option value="">All types</option>
            {SOURCE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p aria-live="polite">
          Showing {filteredSources.length} of {sources.length}
        </p>
      </div>

      {filteredSources.length ? (
        <div className="source-library__list">
          {filteredSources.map((source) => (
            <article className="source-card" key={source.id}>
              <div className="source-card__topline">
                <span className="source-card__type">{sourceTypeLabel(source.source_type)}</span>
                <span className="source-card__index" aria-hidden="true">
                  {String(filteredSources.indexOf(source) + 1).padStart(2, "0")}
                </span>
              </div>
              <h2>{source.title}</h2>
              <p className="source-card__byline">
                {source.author_text || "Author not listed"}
                {source.publisher ? ` · ${source.publisher}` : ""}
              </p>
              <dl className="source-card__details">
                {source.url ? (
                  <div>
                    <dt>URL</dt>
                    <dd>
                      <a href={source.url} rel="noreferrer" target="_blank">
                        {source.url.replace(/^https?:\/\//, "")}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {source.archive_url ? (
                  <div>
                    <dt>Archive</dt>
                    <dd>
                      <a href={source.archive_url} rel="noreferrer" target="_blank">
                        {source.archive_url.replace(/^https?:\/\//, "")}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {source.isbn ? (
                  <div>
                    <dt>ISBN</dt>
                    <dd>{source.isbn}</dd>
                  </div>
                ) : null}
                {source.doi ? (
                  <div>
                    <dt>DOI</dt>
                    <dd>{source.doi}</dd>
                  </div>
                ) : null}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="source-empty-state">
          <span aria-hidden="true">⌁</span>
          <h2>{sources.length ? "No sources match that search." : "No sources added yet."}</h2>
          <p>
            {sources.length
              ? "Try a different title, contributor, or source type."
              : "Add the books, conversations, and evidence that give a story its depth."}
          </p>
          {!sources.length ? (
            <button className="secondary-action" onClick={openSheet} type="button">
              Add the first source
            </button>
          ) : null}
        </div>
      )}

      <WorkspaceSheet
        description="Record the bibliographic and web details you want to reuse across stories."
        eyebrow="Research library"
        onClose={closeSheet}
        open={sheetOpen}
        size="wide"
        title="Add source"
      >
        {formState === "saved" ? (
          <div className="sheet-success" role="status">
            <span aria-hidden="true">✓</span>
            <h3>Source added to the library.</h3>
            <p>It is now available to cite from the story editor.</p>
            <button className="primary-action" onClick={closeSheet} type="button">
              Return to research library
            </button>
          </div>
        ) : (
          <form className="source-form" onSubmit={submitSource} ref={formRef}>
            <div className="source-form__grid">
              <label>
                Type
                <select defaultValue="website" name="sourceType" required>
                  {SOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="source-form__wide-field">
                Title
                <input autoFocus name="title" required />
              </label>
              <label>
                Author / organization
                <input name="authorText" />
              </label>
              <label>
                Publisher
                <input name="publisher" />
              </label>
              <label>
                URL
                <input name="url" type="url" />
              </label>
              <label>
                Archive URL
                <input name="archiveUrl" type="url" />
              </label>
              <label>
                ISBN
                <input name="isbn" />
              </label>
              <label>
                DOI
                <input name="doi" />
              </label>
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="source-form__actions">
              <button className="secondary-action" onClick={closeSheet} type="button">
                Cancel
              </button>
              <button className="primary-action" disabled={formState === "saving"} type="submit">
                {formState === "saving" ? "Adding source…" : "Add source"}
              </button>
            </div>
          </form>
        )}
      </WorkspaceSheet>
    </section>
  );
}
