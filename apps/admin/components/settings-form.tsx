"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { updateSiteSettings } from "@/app/admin/cms-actions";
import type {
  PublicationJobStatus,
  SettingsControlCenterData,
  SettingsEnvironment,
} from "@/lib/cms/types";

type SettingsCategoryId =
  | "publication"
  | "editorial-defaults"
  | "publishing"
  | "seo-social"
  | "media"
  | "security"
  | "system";

type SettingsCategory = Readonly<{
  id: SettingsCategoryId;
  label: string;
  description: string;
}>;

const settingsCategories: SettingsCategory[] = [
  { id: "publication", label: "Publication", description: "Identity and public-facing copy" },
  {
    id: "editorial-defaults",
    label: "Editorial defaults",
    description: "What is and is not configured globally",
  },
  { id: "publishing", label: "Publishing", description: "Queue and verification status" },
  { id: "seo-social", label: "SEO & social", description: "Metadata coverage and sources" },
  { id: "media", label: "Media", description: "Asset processing and rights status" },
  { id: "security", label: "Security & access", description: "Authentication and protection" },
  { id: "system", label: "System / environment", description: "Safe runtime information" },
];

type FormState = "idle" | "saving" | "saved" | "error";
type StatusTone = "positive" | "attention" | "neutral" | "quiet";

type SettingsControlCenterProps = Readonly<{
  data: SettingsControlCenterData;
  environment: SettingsEnvironment;
}>;

function formatDate(value: string | null) {
  if (!value) return "No record";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
    timeStyle: "short",
  }).format(date);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function environmentLabel(environment: SettingsEnvironment["environment"]) {
  return environment.slice(0, 1).toUpperCase() + environment.slice(1);
}

function statusLabel(status: PublicationJobStatus) {
  return humanize(status);
}

function StatusMark({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`settings-status settings-status--${tone}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

function DataRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | undefined;
}) {
  return (
    <div className="settings-data-row">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {detail ? <span>{detail}</span> : null}
      </dd>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="settings-section__header">
      <div>
        <span className="workspace-section-kicker">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function ReadOnlyNote({ children }: { children: ReactNode }) {
  return <p className="settings-read-only-note">Read-only · {children}</p>;
}

function PublicationOverview({ data }: { data: SettingsControlCenterData["publishing"] }) {
  if (!data.available) {
    return (
      <div className="settings-empty settings-empty--quiet">
        <StatusMark label="Unavailable" tone="neutral" />
        <p>
          Publication queue information could not be read in this request. The durable publishing
          system remains unchanged; no controls are shown here.
        </p>
      </div>
    );
  }

  const queued = data.counts.queued ?? 0;
  const processing =
    (data.counts.processing ?? 0) + (data.counts.committed ?? 0) + (data.counts.verifying ?? 0);
  const succeeded = data.counts.succeeded ?? 0;
  const attention = (data.counts.failed ?? 0) + (data.counts.dead_letter ?? 0);
  const cancelled = data.counts.cancelled ?? 0;
  const overallTone: StatusTone =
    processing || queued ? "attention" : attention ? "attention" : "positive";
  const overallLabel =
    processing || queued
      ? "In progress"
      : attention
        ? "Needs attention"
        : succeeded
          ? "Operational"
          : "No jobs recorded";

  return (
    <div className="settings-operations">
      <div className="settings-operation-banner">
        <div>
          <span className="settings-field-label">Durable publication queue</span>
          <strong>{overallLabel}</strong>
          <p>
            Based on the current publication_jobs records; no worker controls are exposed.
            {data.latestJob
              ? ` Last recorded: ${humanize(data.latestJob.action)} · ${statusLabel(data.latestJob.status)}.`
              : " No publication job has been recorded yet."}
          </p>
        </div>
        <StatusMark label={overallLabel} tone={overallTone} />
      </div>
      <dl className="settings-metric-grid settings-metric-grid--four">
        <DataRow label="Queued" value={queued.toLocaleString("en-IN")} />
        <DataRow label="Processing / verifying" value={processing.toLocaleString("en-IN")} />
        <DataRow label="Succeeded" value={succeeded.toLocaleString("en-IN")} />
        <DataRow
          label="Failed / dead letter"
          value={attention.toLocaleString("en-IN")}
          detail={cancelled ? `${cancelled.toLocaleString("en-IN")} cancelled` : undefined}
        />
      </dl>
      <dl className="settings-data-list">
        <DataRow
          label="Last successful job"
          value={formatDate(data.latestSuccessfulJob?.updatedAt ?? null)}
          detail={
            data.latestSuccessfulJob
              ? `${humanize(data.latestSuccessfulJob.action)} · ${statusLabel(data.latestSuccessfulJob.status)}`
              : undefined
          }
        />
        <DataRow
          label="Last failed job"
          value={formatDate(data.latestFailedJob?.updatedAt ?? null)}
          detail={
            data.latestFailedJob
              ? `${humanize(data.latestFailedJob.action)} · ${data.latestFailedJob.errorCode ?? statusLabel(data.latestFailedJob.status)}`
              : undefined
          }
        />
        <DataRow
          label="Latest worker event"
          value={data.latestEvent ? data.latestEvent.message : "No event recorded"}
          detail={
            data.latestEvent
              ? `${humanize(data.latestEvent.step)} · ${formatDate(data.latestEvent.occurredAt)}`
              : undefined
          }
        />
      </dl>
    </div>
  );
}

function MediaOverview({ data }: { data: SettingsControlCenterData["media"] }) {
  const hasAttention = Boolean(data.failedAssets || data.assetsRequiringRightsReview);
  const tone: StatusTone = !data.available ? "neutral" : hasAttention ? "attention" : "positive";
  const label = !data.available ? "Unavailable" : hasAttention ? "Review needed" : "Healthy";

  return (
    <div className="settings-operations">
      <div className="settings-operation-banner">
        <div>
          <span className="settings-field-label">Media library</span>
          <strong>{label}</strong>
          <p>Asset and public derivative state from the existing media tables.</p>
        </div>
        <StatusMark label={label} tone={tone} />
      </div>
      <dl className="settings-metric-grid settings-metric-grid--four">
        <DataRow
          label="Assets"
          value={data.totalAssets?.toLocaleString("en-IN") ?? "Unavailable"}
        />
        <DataRow label="Ready" value={data.readyAssets?.toLocaleString("en-IN") ?? "Unavailable"} />
        <DataRow
          label="Public variants"
          value={data.publicVariants?.toLocaleString("en-IN") ?? "Unavailable"}
        />
        <DataRow
          label="Needs review"
          value={
            data.available
              ? ((data.failedAssets ?? 0) + (data.assetsRequiringRightsReview ?? 0)).toLocaleString(
                  "en-IN",
                )
              : "Unavailable"
          }
          detail={
            data.available
              ? `${data.failedAssets ?? 0} processing failed · ${data.assetsRequiringRightsReview ?? 0} rights flagged`
              : undefined
          }
        />
      </dl>
      <ReadOnlyNote>
        Alt text, captions, credits, rights, focal point, uploads, and processing belong to
        individual assets in Media. There is no supported global media default to edit here.
      </ReadOnlyNote>
    </div>
  );
}

export function SettingsControlCenter({ data, environment }: SettingsControlCenterProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>("publication");
  const [values, setValues] = useState({
    name: data.publication.name,
    tagline: data.publication.tagline,
  });
  const [savedValues, setSavedValues] = useState(values);
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const hasUnsavedChanges =
    values.name !== savedValues.name || values.tagline !== savedValues.tagline;
  const isSaving = isPending || formState === "saving";

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [hasUnsavedChanges]);

  function selectCategory(category: SettingsCategoryId) {
    setActiveCategory(category);
    document.getElementById(`settings-${category}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.name.trim() || !values.tagline.trim()) {
      setFormState("error");
      setError("Publication name and tagline are required.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    setFormState("saving");
    setError("");
    startTransition(() => {
      void (async () => {
        try {
          await updateSiteSettings(formData);
          setSavedValues(values);
          setFormState("saved");
        } catch {
          setFormState("error");
          setError("Settings could not be saved. Check the fields and try again.");
        }
      })();
    });
  }

  function cancelChanges() {
    setValues(savedValues);
    setFormState("idle");
    setError("");
  }

  return (
    <div className="settings-control-center">
      <aside className="settings-index" aria-label="Settings categories">
        <div className="settings-index__intro">
          <span className="workspace-section-kicker">Settings index</span>
          <p>Only capabilities backed by Subtext are listed.</p>
        </div>
        <nav className="settings-index__nav">
          {settingsCategories.map((category) => (
            <button
              aria-current={activeCategory === category.id ? "true" : undefined}
              className={activeCategory === category.id ? "is-active" : undefined}
              key={category.id}
              onClick={() => selectCategory(category.id)}
              type="button"
            >
              <span>{category.label}</span>
              <small>{category.description}</small>
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-content">
        <label className="settings-category-select">
          <span>Jump to section</span>
          <select
            aria-label="Jump to Settings section"
            onChange={(event) => selectCategory(event.target.value as SettingsCategoryId)}
            value={activeCategory}
          >
            {settingsCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>

        <section className="settings-section settings-section--editable" id="settings-publication">
          <SectionHeader
            description="These are the only global publication identity values currently persisted by the CMS. They are written as public site settings."
            eyebrow="Publication"
            title="Identity, kept simple"
          />
          <form className="settings-edit-form" onSubmit={submitSettings}>
            <div className="settings-fields">
              <label htmlFor="settings-brand-name">
                <span className="settings-field-label">Publication name</span>
                <input
                  id="settings-brand-name"
                  maxLength={100}
                  name="brandName"
                  onChange={(event) => {
                    setValues((current) => ({ ...current, name: event.target.value }));
                    setFormState("idle");
                    setError("");
                  }}
                  required
                  value={values.name}
                />
                <span className="settings-field-help">
                  Up to 100 characters. Stored as brand.name.
                </span>
              </label>
              <label htmlFor="settings-tagline">
                <span className="settings-field-label">Tagline</span>
                <input
                  id="settings-tagline"
                  maxLength={200}
                  name="tagline"
                  onChange={(event) => {
                    setValues((current) => ({ ...current, tagline: event.target.value }));
                    setFormState("idle");
                    setError("");
                  }}
                  required
                  value={values.tagline}
                />
                <span className="settings-field-help">
                  Up to 200 characters. Stored as brand.tagline.
                </span>
              </label>
            </div>
            <div className="settings-edit-form__meta">
              <span>
                Last saved {formatDate(data.publication.updatedAt)} · public setting rows only
              </span>
              {hasUnsavedChanges ? <strong>Unsaved changes</strong> : null}
            </div>
            <div className="settings-actions">
              <p
                aria-live="polite"
                className={`settings-feedback settings-feedback--${formState}`}
                role={formState === "error" ? "alert" : undefined}
              >
                {formState === "saved" ? "Saved to the publication settings." : null}
                {formState === "saving" ? "Saving publication settings…" : null}
                {formState === "error" ? error : null}
                {formState === "idle" && hasUnsavedChanges ? "Changes are not saved yet." : null}
              </p>
              <button
                className="secondary-action"
                disabled={!hasUnsavedChanges || isSaving}
                onClick={cancelChanges}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-action"
                disabled={!hasUnsavedChanges || isSaving}
                type="submit"
              >
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-section" id="settings-editorial-defaults">
          <SectionHeader
            description="Story defaults are deliberately not presented as global controls because the current CMS stores these values on each story or immutable revision."
            eyebrow="Editorial defaults"
            title="The editor owns the story"
          />
          <div className="settings-empty">
            <StatusMark label="No global defaults configured" tone="quiet" />
            <p>
              Titles, excerpts, slugs, taxonomy, tags, sources, cover media, and story SEO fields
              are edited in the story workspace. Word count and reading time are derived from
              Markdown.
            </p>
            <Link className="secondary-action" href="/admin/stories">
              Open story library <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <section className="settings-section" id="settings-publishing">
          <SectionHeader
            description="The publishing worker and database queue remain authoritative. This view reports stored state but cannot mutate jobs or worker configuration."
            eyebrow="Publishing"
            title="A clear view of the queue"
          />
          <PublicationOverview data={data.publishing} />
        </section>

        <section className="settings-section" id="settings-seo-social">
          <SectionHeader
            description="SEO and social metadata is split between per-story revision fields and derived public routes. No unsupported global overrides are offered."
            eyebrow="SEO & social"
            title="Metadata, with its source visible"
          />
          <div className="settings-information-grid">
            <dl className="settings-data-list">
              <DataRow
                label="Publication identity"
                value="Stored and public"
                detail="site_settings · brand.name and brand.tagline"
              />
              <DataRow
                label="Article SEO"
                value="Story-level"
                detail="article_revisions · seo_title and seo_description"
              />
              <DataRow
                label="Social metadata"
                value="Story-level"
                detail="article_revisions · social_title and social_description"
              />
            </dl>
            <div className="settings-context-note">
              <span className="settings-field-label">Derived public surfaces</span>
              <p>
                Canonical URLs, sitemap, RSS, robots, Open Graph, Twitter cards, and structured data
                are generated by the existing public application from published article data and the
                configured public site origin.
              </p>
              <ReadOnlyNote>
                No global SEO title, description, social image, or feed setting is supported.
              </ReadOnlyNote>
            </div>
          </div>
        </section>

        <section className="settings-section" id="settings-media">
          <SectionHeader
            description="Media settings are operational facts from the existing asset and derivative tables, not a second upload configuration system."
            eyebrow="Media"
            title="Assets ready for publication"
          />
          <MediaOverview data={data.media} />
        </section>

        <section className="settings-section" id="settings-security">
          <SectionHeader
            description="Access is intentionally narrow. Security-sensitive configuration stays in server and Supabase environments, never in this UI."
            eyebrow="Security & access"
            title="Founder access, GitHub only"
          />
          <div className="settings-security-panel">
            <div className="settings-security-panel__heading">
              <StatusMark label="Protected" tone="positive" />
              <strong>GitHub OAuth only</strong>
              <p>
                This Settings page is available only after the existing server-side founder
                identity, provider, session, and admin-claim checks succeed.
              </p>
            </div>
            <dl className="settings-data-list">
              <DataRow
                label="Identity provider"
                value="GitHub"
                detail="No alternate provider is configured"
              />
              <DataRow
                label="Route protection"
                value="Server + RLS"
                detail="Protected layout, actions, APIs, and database policies"
              />
              <DataRow
                label="Credentials"
                value="Not displayed"
                detail="OAuth, Supabase, worker, hook, and revalidation secrets stay server-side"
              />
            </dl>
          </div>
        </section>

        <section className="settings-section" id="settings-system">
          <SectionHeader
            description="Safe deployment context only. Values that identify private infrastructure or grant access are intentionally omitted."
            eyebrow="System / environment"
            title="Know where you are"
          />
          <dl className="settings-data-list settings-data-list--system">
            <DataRow
              label="Environment"
              value={environmentLabel(environment.environment)}
              detail="Derived from the deployment runtime"
            />
            <DataRow
              label="Application version"
              value={environment.appVersion}
              detail="Admin package version"
            />
            <DataRow
              label="Public site origin"
              value={environment.siteOrigin ?? "Unavailable"}
              detail="Used by public canonical and feed surfaces"
            />
            <DataRow
              label="Admin callback"
              value="Configured server-side"
              detail="The exact callback URL is not displayed"
            />
          </dl>
          <ReadOnlyNote>
            No Supabase keys, OAuth credentials, worker secrets, hook secrets, cron secrets, or
            private infrastructure values are rendered or editable here.
          </ReadOnlyNote>
        </section>
      </div>
    </div>
  );
}

// Kept as a compatibility export for callers that still import the old component name.
export function SettingsForm({
  initialName,
  initialTagline,
}: Readonly<{ initialName: string; initialTagline: string }>) {
  return (
    <SettingsControlCenter
      data={{
        publication: { name: initialName, tagline: initialTagline, updatedAt: null },
        publishing: {
          available: false,
          counts: {},
          latestJob: null,
          latestSuccessfulJob: null,
          latestFailedJob: null,
          latestEvent: null,
        },
        media: {
          available: false,
          totalAssets: null,
          readyAssets: null,
          failedAssets: null,
          assetsRequiringRightsReview: null,
          publicVariants: null,
        },
      }}
      environment={{ environment: "development", appVersion: "—", siteOrigin: null }}
    />
  );
}
