"use client";

import { useState } from "react";

import { MediaUploadForm } from "@/components/media-upload-form";
import { WorkspaceSheet } from "@/components/workspace-sheet";
import type { MediaItem } from "@/lib/cms/types";

type MediaLibraryProps = Readonly<{
  media: MediaItem[];
}>;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function MediaVisual({ asset, detail = false }: { asset: MediaItem; detail?: boolean }) {
  return asset.publicUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      alt={asset.default_alt_text ?? ""}
      className={detail ? "media-detail__image" : undefined}
      src={asset.publicUrl}
    />
  ) : (
    <div className="media-placeholder" role="img" aria-label="Preview unavailable">
      <span aria-hidden="true">◌</span>
      <small>Preview unavailable</small>
    </div>
  );
}

export function MediaLibrary({ media }: MediaLibraryProps) {
  const [selectedAsset, setSelectedAsset] = useState<MediaItem | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  function closeUpload() {
    setUploadOpen(false);
  }

  return (
    <section className="media-library-shell" aria-label="Media library">
      <div className="media-library-toolbar">
        <div>
          <span className="workspace-section-kicker">Publication assets</span>
          <p>
            {media.length
              ? `${media.length} asset${media.length === 1 ? "" : "s"} in the library`
              : "A considered home for publication imagery"}
          </p>
        </div>
        <button className="primary-action" onClick={() => setUploadOpen(true)} type="button">
          <span aria-hidden="true">+</span> Upload media
        </button>
      </div>

      {media.length ? (
        <div className="media-library-grid">
          {media.map((asset) => (
            <article className="media-asset-card" key={asset.id}>
              <button
                aria-label={`Open details for ${asset.original_filename}`}
                className="media-asset-card__button"
                onClick={() => setSelectedAsset(asset)}
                type="button"
              >
                <span className="media-asset-card__visual">
                  <MediaVisual asset={asset} />
                  <span className="media-asset-card__open">View details</span>
                </span>
                <span className="media-asset-card__copy">
                  <strong title={asset.original_filename}>{asset.original_filename}</strong>
                  <span>{asset.default_alt_text || "Alt text not available"}</span>
                  <small>
                    {asset.width && asset.height
                      ? `${asset.width} × ${asset.height}`
                      : "Dimensions unavailable"}
                    <i aria-hidden="true"> · </i>
                    {humanize(asset.processing_status)}
                  </small>
                </span>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="media-empty-state">
          <span aria-hidden="true" className="media-empty-state__mark">
            ◇
          </span>
          <h2>No media uploaded yet.</h2>
          <p>
            Upload a cover, photograph, or illustration when a story is ready for its visual
            language.
          </p>
          <button className="secondary-action" onClick={() => setUploadOpen(true)} type="button">
            Add the first asset
          </button>
        </div>
      )}

      <WorkspaceSheet
        description="Add a publication image with the metadata required for accessible publishing."
        eyebrow="Media library"
        onClose={closeUpload}
        open={uploadOpen}
        size="default"
        title="Upload media"
      >
        <MediaUploadForm onComplete={closeUpload} />
      </WorkspaceSheet>

      <WorkspaceSheet
        description={selectedAsset?.default_alt_text ?? undefined}
        eyebrow="Asset details"
        onClose={() => setSelectedAsset(null)}
        open={Boolean(selectedAsset)}
        size="wide"
        title={selectedAsset?.original_filename ?? "Asset details"}
      >
        {selectedAsset ? (
          <div className="media-detail">
            <div className="media-detail__visual">
              <MediaVisual asset={selectedAsset} detail />
            </div>
            <div className="media-detail__information">
              <div className="media-detail__meta-grid">
                <div>
                  <span>File type</span>
                  <strong>{selectedAsset.mime_type}</strong>
                </div>
                <div>
                  <span>File size</span>
                  <strong>{formatBytes(selectedAsset.byte_size)}</strong>
                </div>
                <div>
                  <span>Dimensions</span>
                  <strong>
                    {selectedAsset.width && selectedAsset.height
                      ? `${selectedAsset.width} × ${selectedAsset.height}`
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{humanize(selectedAsset.processing_status)}</strong>
                </div>
              </div>
              <dl className="media-detail__fields">
                <div>
                  <dt>Alt text</dt>
                  <dd>{selectedAsset.default_alt_text || "Not supplied"}</dd>
                </div>
                <div>
                  <dt>Caption</dt>
                  <dd>{selectedAsset.default_caption || "Not supplied"}</dd>
                </div>
                <div>
                  <dt>Credit</dt>
                  <dd>{selectedAsset.credit_text || "Not supplied"}</dd>
                </div>
                <div>
                  <dt>Rights</dt>
                  <dd>{humanize(selectedAsset.rights_status)}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}
      </WorkspaceSheet>
    </section>
  );
}
