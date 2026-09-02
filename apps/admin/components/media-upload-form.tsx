"use client";

import { getSupabaseBrowserClient } from "@subtext/supabase/browser";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { createMediaUploadIntent, finalizeMediaUpload } from "@/app/admin/cms-actions";

type MediaUploadFormProps = Readonly<{
  onComplete?: () => void;
}>;

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

const activeStates = new Set(["hashing", "uploading", "processing"]);

export function MediaUploadForm({ onComplete }: MediaUploadFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  function chooseFile(file: File | null) {
    if (!file) return;
    setSelectedFile(file);
    setError("");
  }

  async function submit(formData: FormData) {
    const file =
      selectedFile ?? (formData.get("file") instanceof File ? formData.get("file") : null);
    setState("hashing");
    setError("");
    try {
      if (!(file instanceof File) || !file.size) throw new Error("Choose an image");
      const checksumSha256 = hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const intent = await createMediaUploadIntent({
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
        checksumSha256,
        altText: String(formData.get("altText") ?? ""),
        caption: String(formData.get("caption") ?? ""),
        credit: String(formData.get("credit") ?? ""),
        rightsStatus: String(formData.get("rightsStatus") ?? "owned"),
      });
      setState("uploading");
      const supabase = getSupabaseBrowserClient();
      const upload = await supabase.storage
        .from("media-originals")
        .uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (upload.error) throw new Error("Upload failed");
      setState("processing");
      await finalizeMediaUpload(intent.id);
      setState("complete");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
      onComplete?.();
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Upload failed");
    }
  }

  return (
    <form action={submit} className="management-form media-upload-form">
      <div className="media-upload-form__intro">
        <span className="workspace-section-kicker">Asset library</span>
        <h2>Upload an image</h2>
        <p>
          Keep the original, add its context, and let Subtext prepare publication-ready variants.
        </p>
      </div>
      <label
        className={`media-upload-dropzone${isDragging ? " media-upload-dropzone--dragging" : ""}`}
        htmlFor="media-upload-file"
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          chooseFile(event.dataTransfer.files[0] ?? null);
        }}
      >
        <span className="media-upload-dropzone__icon" aria-hidden="true">
          ↑
        </span>
        <strong>{selectedFile ? selectedFile.name : "Drop an image here"}</strong>
        <span>
          {selectedFile ? "Ready to upload" : "or choose JPEG, PNG, WebP, or AVIF · 25 MB max"}
        </span>
        <input
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="visually-hidden-input"
          id="media-upload-file"
          name="file"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          ref={fileInputRef}
          required={!selectedFile}
          type="file"
        />
      </label>
      <label>
        Alt text
        <input name="altText" required />
      </label>
      <label>
        Caption
        <input name="caption" />
      </label>
      <label>
        Credit
        <input name="credit" />
      </label>
      <label>
        Rights
        <select defaultValue="owned" name="rightsStatus">
          <option value="owned">Owned</option>
          <option value="licensed">Licensed</option>
          <option value="public_domain">Public domain</option>
          <option value="creative_commons">Creative Commons</option>
          <option value="permission_granted">Permission granted</option>
        </select>
      </label>
      <button className="primary-action" disabled={activeStates.has(state)} type="submit">
        {state === "idle"
          ? "Upload and process"
          : state === "complete"
            ? "Upload another"
            : state === "error"
              ? "Try again"
              : `${state[0]?.toUpperCase()}${state.slice(1)}…`}
      </button>
      {activeStates.has(state) ? (
        <p aria-live="polite" className="form-progress">
          {state === "hashing"
            ? "Checking the original file…"
            : state === "uploading"
              ? "Uploading the original…"
              : "Preparing responsive variants…"}
        </p>
      ) : null}
      {state === "complete" ? (
        <p aria-live="polite" className="form-success">
          Asset uploaded and added to the library.
        </p>
      ) : null}
      {error ? (
        <p className="auth-message" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
