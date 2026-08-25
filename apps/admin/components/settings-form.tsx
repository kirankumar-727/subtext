"use client";

import { useRef, useState, useTransition } from "react";

import { updateSiteSettings } from "@/app/admin/cms-actions";

type SettingsFormProps = Readonly<{
  initialName: string;
  initialTagline: string;
}>;

type FormState = "idle" | "saving" | "saved" | "error";

export function SettingsForm({ initialName, initialTagline }: SettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function submitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormState("saving");
    setError("");
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        await updateSiteSettings(formData);
        setFormState("saved");
      } catch {
        setFormState("error");
        setError("Settings could not be saved. Check the fields and try again.");
      }
    });
  }

  return (
    <form className="settings-form" onSubmit={submitSettings} ref={formRef}>
      <div className="settings-form__section">
        <div>
          <span className="workspace-section-kicker">Publication identity</span>
          <h2>How the publication introduces itself</h2>
          <p>These two details appear wherever the publication brand is shown.</p>
        </div>
        <div className="settings-form__fields">
          <label>
            Publication name
            <input defaultValue={initialName} maxLength={100} name="brandName" required />
            <span>The name readers will see across Subtext.</span>
          </label>
          <label>
            Tagline
            <input defaultValue={initialTagline} maxLength={200} name="tagline" required />
            <span>A short line that sits alongside the publication name.</span>
          </label>
        </div>
      </div>

      <div className="settings-form__footer">
        <p aria-live="polite" className={`settings-feedback settings-feedback--${formState}`}>
          {formState === "saved" ? "Saved to the publication settings." : null}
          {formState === "saving" ? "Saving publication settings…" : null}
          {formState === "error" ? error : null}
        </p>
        <button className="primary-action" disabled={formState === "saving"} type="submit">
          {formState === "saving" ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
