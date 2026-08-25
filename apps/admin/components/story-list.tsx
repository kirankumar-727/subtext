"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

type Story = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  first_published_at: string | null;
  pillar: { name: string; slug: string } | null;
};
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
      <div className="story-filters">
        <input
          aria-label="Search stories"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stories…"
          value={query}
        />
        <select
          aria-label="Filter by pillar"
          onChange={(e) => setPillar(e.target.value)}
          value={pillar}
        >
          <option value="">All pillars</option>
          {pillars.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          onChange={(e) => setStatus(e.target.value)}
          value={status}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>
        <select
          aria-label="Sort by updated date"
          onChange={(e) => setSort(e.target.value)}
          value={sort}
        >
          <option value="newest">Recently updated</option>
          <option value="oldest">Oldest updated</option>
        </select>
      </div>
      <div className="notion-list">
        {filtered.map((story) => (
          <Link className="story-row" href={`/admin/stories/${story.id}`} key={story.id}>
            <strong>{story.title}</strong>
            <span>{story.pillar?.name ?? "—"}</span>
            <span>{story.status.replaceAll("_", " ")}</span>
            <time>{new Date(story.updated_at).toLocaleDateString("en-IN")}</time>
            <time>
              {story.first_published_at
                ? new Date(story.first_published_at).toLocaleDateString("en-IN")
                : "—"}
            </time>
          </Link>
        ))}
        {!filtered.length ? <p className="empty-state">No stories match these filters.</p> : null}
      </div>
    </>
  );
}
