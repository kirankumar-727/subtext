/* eslint-disable @next/next/no-img-element */
import { MediaUploadForm } from "@/components/media-upload-form";
import { listMedia } from "@/lib/cms/queries";
export default async function MediaPage() {
  const media = await listMedia();
  return (
    <main className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Assets</p>
          <h1>Media</h1>
        </div>
      </header>
      <section className="split-management">
        <MediaUploadForm />
        <div className="media-library">
          {media.map((asset) => (
            <article key={asset.id}>
              {asset.publicUrl ? (
                <img alt={asset.default_alt_text ?? ""} src={asset.publicUrl} />
              ) : (
                <div className="media-placeholder" />
              )}
              <div>
                <strong>{asset.original_filename}</strong>
                <p>{asset.default_alt_text}</p>
                <small>{asset.credit_text ?? "No credit"}</small>
              </div>
            </article>
          ))}
          {!media.length ? <p className="empty-state">No media uploaded yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
