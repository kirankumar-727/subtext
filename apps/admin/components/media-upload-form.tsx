"use client";

import { getSupabaseBrowserClient } from "@subtext/supabase/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createMediaUploadIntent, finalizeMediaUpload } from "@/app/admin/cms-actions";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function MediaUploadForm() {
  const router = useRouter();
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setState("hashing");
    setError("");
    try {
      const file = formData.get("file");
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
      router.refresh();
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Upload failed");
    }
  }

  return (
    <form action={submit} className="management-form">
      <h2>Upload image</h2>
      <label>
        Image
        <input
          accept="image/jpeg,image/png,image/webp,image/avif"
          name="file"
          required
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
      <button
        className="primary-action"
        disabled={!["idle", "complete", "error"].includes(state)}
        type="submit"
      >
        {state === "idle"
          ? "Upload and process"
          : state === "complete"
            ? "Upload another"
            : state === "error"
              ? "Try again"
              : `${state[0]?.toUpperCase()}${state.slice(1)}…`}
      </button>
      {error ? (
        <p className="auth-message" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
