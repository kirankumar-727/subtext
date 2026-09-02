"use client";

import { useMemo } from "react";

import type { StoryData, WorkspaceReferenceData } from "@/lib/cms/queries";
import {
  buildPublicationReadiness,
  type PublicationReadinessCheck,
} from "@/lib/cms/publication-readiness";
import type { SaveState, StoryDraftInput, StoryMediaReadiness } from "@/lib/cms/types";

type PublicationReadinessPanelProps = {
  draft: StoryDraftInput;
  story: StoryData;
  reference: WorkspaceReferenceData;
  saveState: SaveState;
};

function checkIcon(check: PublicationReadinessCheck) {
  if (check.state === "pass") return "✓";
  if (check.state === "fail") return "×";
  if (check.state === "warning") return "!";
  return "·";
}

function checkClass(check: PublicationReadinessCheck) {
  return `publication-readiness__check publication-readiness__check--${check.state}`;
}

function toHeroReadiness(asset: WorkspaceReferenceData["media"][number]): StoryMediaReadiness {
  return {
    mediaAssetId: asset.id,
    role: "hero",
    placementAltText: asset.default_alt_text,
    kind: asset.kind,
    processingStatus: asset.processing_status,
    rightsStatus: asset.rights_status,
    defaultAltText: asset.default_alt_text,
    hasPublicVariant: asset.hasPublicVariant,
  };
}

export function PublicationReadinessPanel({
  draft,
  reference,
  saveState,
  story,
}: PublicationReadinessPanelProps) {
  const readiness = useMemo(() => {
    const savedMedia = story.readiness.media;
    let media = savedMedia;

    let mediaStatusUnavailable = false;
    if (draft.coverMediaAssetId !== story.coverMediaAssetId) {
      const savedNonHeroMedia = savedMedia.filter((item) => item.role !== "hero");
      const selectedAsset = draft.coverMediaAssetId
        ? reference.media.find((asset) => asset.id === draft.coverMediaAssetId)
        : null;
      mediaStatusUnavailable = Boolean(draft.coverMediaAssetId && !selectedAsset);
      media = selectedAsset
        ? [...savedNonHeroMedia, toHeroReadiness(selectedAsset)]
        : savedNonHeroMedia;
    }

    const selectedCategory = draft.categoryId
      ? reference.categories.find((category) => category.id === draft.categoryId)
      : null;
    const categoryIsKnown = draft.categoryId
      ? Boolean(selectedCategory) ||
        (draft.categoryId === story.article.category_id && story.readiness.categoryIsKnown)
      : true;
    const categoryPillarId = selectedCategory?.pillar_id ?? story.readiness.categoryPillarId;

    return buildPublicationReadiness({
      revisionMatchesArticle:
        Boolean(story.readiness.revisionId) &&
        story.readiness.revisionId === story.article.current_draft_revision_id,
      title: draft.title,
      slug: draft.slug,
      markdown: draft.markdown,
      pillarId: draft.pillarId,
      categoryId: draft.categoryId,
      categoryPillarId,
      categoryIsKnown,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      selectedSourceCount: draft.sourceIds.length,
      publicCitationCount: story.readiness.publicCitationCount,
      media,
      mediaStatusUnavailable,
    });
  }, [draft, reference.categories, reference.media, story]);

  const statusLabel = readiness.isReady
    ? readiness.warningChecks.length
      ? "READY · REVIEW NOTES"
      : "READY TO PUBLISH"
    : "NOT READY";

  return (
    <section
      aria-labelledby="publication-readiness-heading"
      className={`publication-readiness publication-readiness--${readiness.isReady ? "ready" : "blocked"}`}
    >
      <div className="publication-readiness__header">
        <div>
          <span className="inspector-eyebrow">Before it goes out</span>
          <h3 id="publication-readiness-heading">Publication readiness</h3>
        </div>
        <span
          aria-label={statusLabel}
          className="publication-readiness__status"
          data-state={readiness.isReady ? "ready" : "blocked"}
        >
          <span aria-hidden="true" />
          {statusLabel}
        </span>
      </div>
      <p className="publication-readiness__intro">
        Guidance from the existing publication conditions. Publish still goes through the server
        validator and request workflow.
      </p>
      {saveState === "unsaved" || saveState === "saving" ? (
        <p className="publication-readiness__save-note">
          {saveState === "saving"
            ? "Saving the current draft before publication checks complete."
            : "Save the draft to persist this version; draft saving remains available while media finishes processing."}
        </p>
      ) : null}
      <ul className="publication-readiness__checks">
        {readiness.checks.map((check) => (
          <li className={checkClass(check)} key={check.code}>
            <span aria-hidden="true" className="publication-readiness__icon">
              {checkIcon(check)}
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.message}</small>
            </span>
          </li>
        ))}
      </ul>
      {!readiness.isReady ? (
        <p className="publication-readiness__footnote">
          Resolve the blocked conditions above, then save and retry. The Publish action remains
          server-authorized; this panel does not replace the authoritative validator.
        </p>
      ) : readiness.warningChecks.length ? (
        <p className="publication-readiness__footnote">
          Publication can be requested, but the notes marked <strong>!</strong> are recommended
          before sending the story out.
        </p>
      ) : (
        <p className="publication-readiness__footnote">
          No blocking conditions are visible in this draft. The server remains authoritative.
        </p>
      )}
    </section>
  );
}
