"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { validateStoryPackage, importStoryPackage } from "@/app/admin/cms-actions";

type ImportPreview = {
  title: string;
  slug: string;
  pillarName: string;
  categoryName: string | null;
  authorName: string;
  wordCount: number;
  readingTimeMinutes: number;
  citationCount: number;
  mediaCount: number;
  seoTitle: string;
  seoDescription: string;
  tagNames: string[];
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
  canImport: boolean;
};

type ImportStep = "upload" | "validating" | "preview" | "importing" | "success" | "error";

export function StoryPackageImporter() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [packageJson, setPackageJson] = useState<string | null>(null);
  const [zipBytes, setZipBytes] = useState<Uint8Array | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Array<{ code: string; level: "error" | "warning"; message: string }>
  >([]);
  const [validationWarnings, setValidationWarnings] = useState<
    Array<{ code: string; level?: "error" | "warning"; message: string }>
  >([]);
  const [importErrors, setImportErrors] = useState<Array<{ code: string; message: string }>>([]);
  const [createdArticleId, setCreatedArticleId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  const MAX_BYTES = 256_000;

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setValidationErrors([]);
    setValidationWarnings([]);
    setImportErrors([]);
    setPreview(null);
    setPackageJson(null);
    setZipBytes(null);
    setCreatedArticleId(null);

    // Client-side size check
    if (file.size > MAX_BYTES) {
      setValidationErrors([
        {
          code: "package_too_large",
          level: "error",
          message: `The uploaded file is ${(file.size / 1024).toFixed(1)} KB. The maximum Story Package size is 250 KB (${MAX_BYTES.toLocaleString()} bytes).`,
        },
      ]);
      setStep("error");
      return;
    }

    if (file.size === 0) {
      setValidationErrors([
        {
          code: "empty_file",
          level: "error",
          message: "The uploaded file is empty.",
        },
      ]);
      setStep("error");
      return;
    }

    // Check file extension
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "zip" && ext !== "md") {
      setValidationErrors([
        {
          code: "unsupported_format",
          level: "error",
          message: 'Only .zip (Story Package) and .md (single Markdown file) formats are supported.',
        },
      ]);
      setStep("error");
      return;
    }

    setStep("validating");
    setUploadProgress("Reading file…");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      setUploadProgress("Validating package…");

      const result = await validateStoryPackage(bytes);

      if (!result.ok) {
        setValidationErrors(result.errors);
        setValidationWarnings(result.warnings);
        setStep("error");
        return;
      }

      setPreview(result.preview);
      setPackageJson(result.packageJson);
      setZipBytes(bytes);
      setValidationWarnings(result.preview.warnings);
      setStep("preview");
    } catch (err) {
      setValidationErrors([
        {
          code: "unexpected_error",
          level: "error",
          message: `An unexpected error occurred during validation: ${err instanceof Error ? err.message : "unknown error"}`,
        },
      ]);
      setStep("error");
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!packageJson || !zipBytes) return;

    setStep("importing");
    setUploadProgress("Creating story draft…");

    try {
      const result = await importStoryPackage(packageJson, zipBytes);

      if (result.ok) {
        setCreatedArticleId(result.articleId);
        setStep("success");
      } else {
        setImportErrors(result.errors);
        setStep("error");
      }
    } catch (err) {
      setImportErrors([
        {
          code: "unexpected_error",
          message: `Import failed: ${err instanceof Error ? err.message : "unknown error"}`,
        },
      ]);
      setStep("error");
    }
  }, [packageJson, zipBytes]);

  const handleCancel = useCallback(() => {
    setStep("upload");
    setPreview(null);
    setPackageJson(null);
    setZipBytes(null);
    setValidationErrors([]);
    setValidationWarnings([]);
    setImportErrors([]);
    setCreatedArticleId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <div className="story-package-importer">
      {/* Upload Step */}
      {step === "upload" && (
        <div className="import-upload">
          <div className="import-dropzone">
            <span aria-hidden="true" className="import-dropzone__icon">
              ↑
            </span>
            <p>Drop a Story Package (.zip) or Markdown file (.md) here</p>
            <label className="primary-action import-file-label">
              Choose file
              <input
                accept=".zip,.md"
                onChange={handleFileSelect}
                ref={fileInputRef}
                type="file"
              />
            </label>
            <small>Maximum package size: 250 KB</small>
          </div>

          <div className="import-format-help">
            <h3>Supported formats</h3>
            <dl>
              <dt>Story Package (.zip)</dt>
              <dd>
                A ZIP archive containing <code>story.md</code>, optional{" "}
                <code>images/</code>, <code>sources/</code>, and <code>metadata/</code>{" "}
                directories.
              </dd>
              <dt>Markdown (.md)</dt>
              <dd>
                A single Markdown file with YAML frontmatter containing title, slug, pillar,
                author, and optional metadata.
              </dd>
            </dl>
          </div>
        </div>
      )}

      {/* Validating Step */}
      {step === "validating" && (
        <div className="import-progress">
          <div className="import-spinner" aria-hidden="true" />
          <p>{uploadProgress}</p>
          <small>Analyzing package structure and validating content…</small>
        </div>
      )}

      {/* Preview Step */}
      {step === "preview" && preview && (
        <div className="import-preview">
          <div className="import-preview__header">
            <h2>Import Preview</h2>
            <p>Review the extracted content before creating a draft.</p>
          </div>

          <div className="import-preview__summary">
            <div className="import-preview__field">
              <span>Title</span>
              <strong>{preview.title}</strong>
            </div>
            <div className="import-preview__field">
              <span>Slug</span>
              <code>{preview.slug}</code>
            </div>
            <div className="import-preview__field">
              <span>Pillar</span>
              <strong>{preview.pillarName}</strong>
            </div>
            {preview.categoryName && (
              <div className="import-preview__field">
                <span>Category</span>
                <strong>{preview.categoryName}</strong>
              </div>
            )}
            <div className="import-preview__field">
              <span>Author</span>
              <strong>{preview.authorName}</strong>
            </div>
            <div className="import-preview__field">
              <span>Word count</span>
              <strong>{preview.wordCount.toLocaleString("en-IN")}</strong>
            </div>
            <div className="import-preview__field">
              <span>Reading time</span>
              <strong>{preview.readingTimeMinutes} min</strong>
            </div>
            <div className="import-preview__field">
              <span>Citations</span>
              <strong>{preview.citationCount}</strong>
            </div>
            <div className="import-preview__field">
              <span>Media</span>
              <strong>{preview.mediaCount}</strong>
            </div>
            <div className="import-preview__field">
              <span>SEO title</span>
              <span>{preview.seoTitle || "Not set"}</span>
            </div>
            <div className="import-preview__field">
              <span>SEO description</span>
              <span>{preview.seoDescription || "Not set"}</span>
            </div>
            {preview.tagNames.length > 0 && (
              <div className="import-preview__field">
                <span>Tags</span>
                <span>{preview.tagNames.join(", ")}</span>
              </div>
            )}
          </div>

          {/* Warnings */}
          {validationWarnings.length > 0 && (
            <div className="import-preview__warnings">
              <h3>Warnings</h3>
              <ul>
                {validationWarnings.map((warning, i) => (
                  <li key={i} className="import-warning">
                    <span aria-hidden="true">!</span>
                    {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Errors */}
          {!preview.canImport && preview.errors.length > 0 && (
            <div className="import-preview__errors">
              <h3>Blocking Errors</h3>
              <ul>
                {preview.errors.map((error, i) => (
                  <li key={i} className="import-error">
                    <span aria-hidden="true">×</span>
                    {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Inspector status */}
          <div className="import-preview__inspector">
            <h3>Publication Readiness</h3>
            <p>
              {preview.canImport
                ? "The imported draft will be created as a private draft. Publication readiness checks will apply once the draft is opened in the editor."
                : "This package has blocking errors that prevent import. Resolve the errors above and try again."}
            </p>
          </div>

          <div className="import-preview__actions">
            <button className="editor-action-secondary" onClick={handleCancel} type="button">
              Cancel
            </button>
            {preview.canImport ? (
              <button className="primary-action" onClick={handleImport} type="button">
                Import story
              </button>
            ) : (
              <button className="primary-action" disabled type="button">
                Cannot import
              </button>
            )}
          </div>
        </div>
      )}

      {/* Importing Step */}
      {step === "importing" && (
        <div className="import-progress">
          <div className="import-spinner" aria-hidden="true" />
          <p>{uploadProgress}</p>
          <small>Creating story draft, sources, and media records…</small>
        </div>
      )}

      {/* Success Step */}
      {step === "success" && (
        <div className="import-success">
          <span aria-hidden="true" className="import-success__icon">
            ✓
          </span>
          <h2>Story Imported</h2>
          <p>
            &ldquo;{preview?.title}&rdquo; has been created as a draft. You can now edit it in the
            story editor.
          </p>
          <div className="import-success__actions">
            <Link
              className="primary-action"
              href={`/admin/stories/${createdArticleId}`}
            >
              Open story editor
            </Link>
            <button
              className="editor-action-secondary"
              onClick={handleCancel}
              type="button"
            >
              Import another
            </button>
            <Link className="editor-action-secondary" href="/admin/stories">
              Back to stories
            </Link>
          </div>
        </div>
      )}

      {/* Error Step */}
      {step === "error" && (
        <div className="import-errors">
          <span aria-hidden="true" className="import-errors__icon">
            ×
          </span>
          <h2>Import Failed</h2>

          {validationErrors.length > 0 && (
            <div className="import-errors__list">
              <h3>Validation Errors</h3>
              <ul>
                {validationErrors.map((error, i) => (
                  <li key={i} className="import-error">
                    <span aria-hidden="true">×</span>
                    {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="import-errors__list">
              <h3>Import Errors</h3>
              <ul>
                {importErrors.map((error, i) => (
                  <li key={i} className="import-error">
                    <span aria-hidden="true">×</span>
                    {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validationWarnings.length > 0 && (
            <div className="import-preview__warnings">
              <h3>Warnings</h3>
              <ul>
                {validationWarnings.map((warning, i) => (
                  <li key={i} className="import-warning">
                    <span aria-hidden="true">!</span>
                    {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="import-errors__actions">
            <button className="primary-action" onClick={handleCancel} type="button">
              Try again
            </button>
            <Link className="editor-action-secondary" href="/admin/stories/new">
              Back to new story
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
