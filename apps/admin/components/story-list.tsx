"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Story = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  first_published_at: string | null;
  last_published_at?: string | null;
  pillar: { name: string; slug: string } | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status: string) {
  return status === "unpublished"
    ? "Unpublished"
    : `${status.slice(0, 1).toUpperCase()}${status.slice(1).replaceAll("_", " ")}`;
}

export function StoryList({
  stories,
  pillars,
  initialStatus = "",
}: {
  stories: Story[];
  pillars: { name: string; slug: string }[];
  initialStatus?: string;
}) {
  const [query, setQuery] = useState("");
  const [pillar, setPillar] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState("newest");
  const filtered = useMemo(
    () =>
      stories
        .filter(
          (story) =>
            story.title.toLowerCase().includes(query.toLowerCase()) &&
            (!pillar || story.pillar?.slug === pillar) &&
            (!status || story.status === status),
        )
        .sort((left, right) =>
          sort === "oldest"
            ? left.updated_at.localeCompare(right.updated_at)
            : right.updated_at.localeCompare(left.updated_at),
        ),
    [stories, query, pillar, status, sort],
  );

  return (
    <>
      <div className="story-filters" role="search">
        <label className="story-filter-field story-filter-field--search">
          <span>Search stories</span>
          <input
            aria-label="Search stories"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles…"
            type="search"
            value={query}
          />
        </label>
        <label className="story-filter-field">
          <span>Pillar</span>
          <select
            aria-label="Filter by pillar"
            onChange={(event) => setPillar(event.target.value)}
            value={pillar}
          >
            <option value="">All pillars</option>
            {pillars.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="story-filter-field">
          <span>Status</span>
          <select
            aria-label="Filter by status"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">All stories</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </select>
        </label>
        <label className="story-filter-field">
          <span>Sort</span>
          <select
            aria-label="Sort by updated date"
            onChange={(event) => setSort(event.target.value)}
            value={sort}
          >
            <option value="newest">Recently updated</option>
            <option value="oldest">Oldest updated</option>
          </select>
        </label>
      </div>

      <p aria-live="polite" className="story-results-count">
        {filtered.length} {filtered.length === 1 ? "story" : "stories"} shown
      </p>

      <div className="notion-list">
        {filtered.map((story) => (
          <Link className="story-row" href={`/admin/stories/${story.id}`} key={story.id}>
            <span className="story-row__title">
              <strong>{story.title}</strong>
              <small>{story.pillar?.name ?? "Pillar not set"}</small>
            </span>
            <span className="story-row__pillar">
              <small>Pillar</small>
              {story.pillar?.name ?? "—"}
            </span>
            <span className={`status-pill status-pill--${story.status}`}>
              <span aria-hidden="true" />
              {statusLabel(story.status)}
            </span>
            <time dateTime={story.updated_at}>
              <small>Updated</small>
              {formatDate(story.updated_at)}
            </time>
            <time dateTime={story.first_published_at ?? undefined}>
              <small>Published</small>
              {formatDate(story.first_published_at ?? story.last_published_at)}
            </time>
            <span aria-hidden="true" className="story-row__arrow">
              ↗
            </span>
          </Link>
        ))}
        {!filtered.length ? (
          <div className="empty-state empty-state--library">
            <span aria-hidden="true">⌁</span>
            <p>
              {stories.length
                ? "No stories match these filters."
                : "No stories in the library yet."}
            </p>
            <small>
              {stories.length
                ? "Try a different title, pillar, or status."
                : "Start with a title and give the idea a place in Subtext."}
            </small>
          </div>
        ) : null}
      </div>
    </>
  );
}
