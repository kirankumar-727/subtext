"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCategory,
  createPillar,
  createTag,
  updateCategory,
  updatePillar,
  updateTag,
} from "@/app/admin/cms-actions";
import type {
  EditorialAuthor,
  EditorialCategory,
  EditorialPillar,
  EditorialStructureData,
  EditorialTag,
} from "@/lib/cms/types";

type EditorialSection = "pillars" | "categories" | "tags" | "authors";
type StatusFilter = "all" | "active" | "inactive";
type FormState = "idle" | "saving" | "error";

type EditorialManagerProps = Readonly<{
  data: EditorialStructureData;
  section: EditorialSection;
}>;

type EditingRecord = {
  id: string;
  description: string;
  sortOrder: string;
};

const pageCopy: Record<
  EditorialSection,
  {
    eyebrow: string;
    title: string;
    description: string;
    singular: string;
    plural: string;
    intro: string;
  }
> = {
  pillars: {
    eyebrow: "Editorial / Taxonomy",
    title: "Pillars",
    description: "The four or five durable ideas that give the publication its shape.",
    singular: "pillar",
    plural: "pillars",
    intro:
      "Top-level editorial homes for stories. Identity fields stay stable so canonical paths remain safe.",
  },
  categories: {
    eyebrow: "Editorial / Taxonomy",
    title: "Categories",
    description: "A clear second layer beneath each pillar, without inventing a deeper hierarchy.",
    singular: "category",
    plural: "categories",
    intro:
      "Every category belongs to exactly one existing pillar. The same relationship drives Story Editor selection.",
  },
  tags: {
    eyebrow: "Editorial / Discovery",
    title: "Tags",
    description:
      "Flexible discovery terms that help readers follow a thread across the publication.",
    singular: "tag",
    plural: "tags",
    intro:
      "Tags are cross-pillar discovery terms. New tags use the same protected path as the Story Editor.",
  },
  authors: {
    eyebrow: "Editorial / Byline",
    title: "Authors",
    description: "The public byline records that appear alongside published work.",
    singular: "author",
    plural: "authors",
    intro:
      "A read-only view of existing byline records. Account linkage and authentication identity stay private.",
  },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function activeLabel(isActive: boolean) {
  return isActive ? "Active" : "Inactive";
}

function matchesStatus(isActive: boolean, status: StatusFilter) {
  return status === "all" || (status === "active" ? isActive : !isActive);
}

function statusClass(isActive: boolean) {
  return isActive ? "active" : "inactive";
}

function safeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function RecordStatus({ isActive }: { isActive: boolean }) {
  return (
    <span className={`editorial-record-status editorial-record-status--${statusClass(isActive)}`}>
      <span aria-hidden="true" />
      {activeLabel(isActive)}
    </span>
  );
}

function FieldPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function EditorialManager({ data, section }: EditorialManagerProps) {
  const router = useRouter();
  const copy = pageCopy[section];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pillarFilter, setPillarFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<EditingRecord | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [newPillarId, setNewPillarId] = useState(data.pillars[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (section === "pillars") {
      return data.pillars.filter(
        (pillar) =>
          matchesStatus(pillar.is_active, status) &&
          (!normalizedQuery ||
            [pillar.name, pillar.slug, pillar.description]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery)),
      );
    }
    if (section === "categories") {
      return data.categories.filter(
        (category) =>
          matchesStatus(category.is_active, status) &&
          (!pillarFilter || category.pillar_id === pillarFilter) &&
          (!normalizedQuery ||
            [category.name, category.slug, category.description]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery)),
      );
    }
    if (section === "tags") {
      return data.tags.filter(
        (tag) =>
          matchesStatus(tag.is_active, status) &&
          (!normalizedQuery ||
            [tag.name, tag.slug, tag.description]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery)),
      );
    }
    return data.authors.filter(
      (author) =>
        matchesStatus(author.is_active, status) &&
        (!normalizedQuery ||
          [author.name, author.slug, author.bio_plain_text, author.website_url]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)),
    );
  }, [data, pillarFilter, query, section, status]);

  const records =
    section === "pillars"
      ? data.pillars
      : section === "categories"
        ? data.categories
        : section === "tags"
          ? data.tags
          : data.authors;
  const activeCount = records.filter((record) => record.is_active).length;
  const filteredCount = filteredRecords.length;
  const hasFilters = Boolean(query.trim() || pillarFilter || status !== "all");
  const canCreate = section !== "authors";

  function clearFilters() {
    setQuery("");
    setPillarFilter("");
    setStatus("all");
  }

  function resetCreateForm() {
    setNewName("");
    setNewDescription("");
    setNewSortOrder("0");
    setNewPillarId(data.pillars[0]?.id ?? "");
    setFormError("");
    setFormState("idle");
  }

  function openCreate() {
    resetCreateForm();
    setCreateOpen(true);
  }

  function closeCreate() {
    if (isPending) return;
    setCreateOpen(false);
    resetCreateForm();
  }

  function beginEdit(record: EditorialPillar | EditorialCategory | EditorialTag) {
    setFormError("");
    setFormState("idle");
    setEditing({
      id: record.id,
      description: record.description ?? "",
      sortOrder: "sort_order" in record ? String(record.sort_order) : "0",
    });
  }

  function closeEdit() {
    if (!isPending) {
      setEditing(null);
      setFormError("");
    }
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormState("saving");
    startTransition(async () => {
      try {
        let result:
          | Awaited<ReturnType<typeof createPillar>>
          | Awaited<ReturnType<typeof createCategory>>
          | Awaited<ReturnType<typeof createTag>>;
        if (section === "pillars") {
          result = await createPillar({
            name: newName,
            description: newDescription,
            sortOrder: safeNumber(newSortOrder),
          });
        } else if (section === "categories") {
          if (!newPillarId) {
            setFormState("error");
            setFormError("Select a parent pillar before creating a category.");
            return;
          }
          result = await createCategory({
            pillarId: newPillarId,
            name: newName,
            description: newDescription,
            sortOrder: safeNumber(newSortOrder),
          });
        } else {
          result = await createTag({ name: newName, description: newDescription });
        }
        if (!result.ok) {
          setFormState("error");
          setFormError(result.message);
          return;
        }
        setFormState("idle");
        setCreateOpen(false);
        resetCreateForm();
        router.refresh();
      } catch {
        setFormState("error");
        setFormError(
          `${copy.singular[0]?.toUpperCase()}${copy.singular.slice(1)} could not be saved. Check the fields and try again.`,
        );
      }
    });
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setFormError("");
    setFormState("saving");
    startTransition(async () => {
      try {
        const result =
          section === "pillars"
            ? await updatePillar({
                id: editing.id,
                description: editing.description,
                sortOrder: safeNumber(editing.sortOrder),
              })
            : section === "categories"
              ? await updateCategory({
                  id: editing.id,
                  description: editing.description,
                  sortOrder: safeNumber(editing.sortOrder),
                })
              : await updateTag({ id: editing.id, description: editing.description });
        if (!result.ok) {
          setFormState("error");
          setFormError(result.message);
          return;
        }
        setEditing(null);
        setFormState("idle");
        router.refresh();
      } catch {
        setFormState("error");
        setFormError("The editorial record could not be updated. Check the fields and try again.");
      }
    });
  }

  return (
    <main className="workspace-page editorial-page">
      <header className="workspace-page__header editorial-page__header">
        <div>
          <p className="workspace-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="workspace-page__lede">{copy.description}</p>
        </div>
        {canCreate ? (
          <button className="primary-action" onClick={openCreate} type="button">
            <span aria-hidden="true">+</span> New {copy.singular}
          </button>
        ) : null}
      </header>

      <section aria-label={`${copy.title} overview`} className="editorial-overview">
        <div>
          <span className="workspace-section-kicker">Editorial structure</span>
          <p>{copy.intro}</p>
        </div>
        <dl>
          <div>
            <dt>Total</dt>
            <dd>{records.length}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{activeCount}</dd>
          </div>
          <div>
            <dt>Showing</dt>
            <dd>{filteredCount}</dd>
          </div>
        </dl>
      </section>

      {section === "authors" ? (
        <aside className="editorial-readonly-note" role="note">
          <strong>Bylines are read-only here.</strong>
          <span>
            Author records are public editorial identities. Authentication linkage is intentionally
            not displayed, and no account-management behavior is exposed.
          </span>
        </aside>
      ) : null}

      {createOpen ? (
        <section aria-labelledby="editorial-create-heading" className="editorial-form-card">
          <div className="editorial-form-card__heading">
            <div>
              <span className="workspace-section-kicker">Add to the structure</span>
              <h2 id="editorial-create-heading">New {copy.singular}</h2>
            </div>
            <button className="editorial-text-button" onClick={closeCreate} type="button">
              Cancel
            </button>
          </div>
          <p className="editorial-form-card__hint">
            The slug is generated from the name using the existing editorial slug rules. It cannot
            be edited here after creation.
          </p>
          <form onSubmit={submitCreate}>
            <div className="editorial-form-grid">
              <label>
                Name
                <input
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setNewName(event.target.value)}
                  required
                  value={newName}
                />
              </label>
              {section === "categories" ? (
                <label>
                  Parent pillar
                  <select
                    onChange={(event) => setNewPillarId(event.target.value)}
                    required
                    value={newPillarId}
                  >
                    <option value="" disabled>
                      Select a pillar
                    </option>
                    {data.pillars.map((pillar) => (
                      <option key={pillar.id} value={pillar.id}>
                        {pillar.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="editorial-form-grid__wide">
                Description
                <textarea
                  maxLength={section === "tags" ? 300 : 500}
                  onChange={(event) => setNewDescription(event.target.value)}
                  placeholder="A short editorial description"
                  rows={3}
                  value={newDescription}
                />
              </label>
              {section !== "tags" ? (
                <label>
                  Sort order
                  <input
                    min="0"
                    onChange={(event) => setNewSortOrder(event.target.value)}
                    type="number"
                    value={newSortOrder}
                  />
                  <small>Lower numbers appear first.</small>
                </label>
              ) : null}
            </div>
            {formError ? (
              <p className="editorial-form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="editorial-form-actions">
              <button
                className="primary-action"
                disabled={isPending || !newName.trim()}
                type="submit"
              >
                {isPending ? "Saving…" : `Create ${copy.singular}`}
              </button>
              <button className="secondary-action" onClick={closeCreate} type="button">
                Not now
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="editorial-library-heading" className="editorial-library">
        <div className={`editorial-toolbar editorial-toolbar--${section}`}>
          <div className="editorial-search-field">
            <label htmlFor="editorial-search">Search {copy.plural}</label>
            <input
              id="editorial-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${copy.plural} by name or slug…`}
              type="search"
              value={query}
            />
          </div>
          {section === "categories" ? (
            <label>
              Pillar
              <select
                onChange={(event) => setPillarFilter(event.target.value)}
                value={pillarFilter}
              >
                <option value="">All pillars</option>
                {data.pillars.map((pillar) => (
                  <option key={pillar.id} value={pillar.id}>
                    {pillar.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Status
            <select
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
          <p aria-live="polite">
            Showing {filteredCount} of {records.length}
          </p>
        </div>

        <div className="editorial-library__heading">
          <div>
            <span className="workspace-section-kicker">The controlled vocabulary</span>
            <h2 id="editorial-library-heading">{copy.title} library</h2>
          </div>
          {hasFilters ? (
            <button className="editorial-text-button" onClick={clearFilters} type="button">
              Clear filters
            </button>
          ) : null}
        </div>

        {filteredRecords.length ? (
          <div className="editorial-record-grid">
            {section === "pillars"
              ? (filteredRecords as EditorialPillar[]).map((pillar, index) => (
                  <PillarCard
                    key={pillar.id}
                    categories={data.categories}
                    editing={editing}
                    formError={formError}
                    formState={formState}
                    index={index}
                    isPending={isPending}
                    onBeginEdit={beginEdit}
                    onChangeEdit={setEditing}
                    onCloseEdit={closeEdit}
                    onSubmitEdit={submitEdit}
                    pillar={pillar}
                  />
                ))
              : null}
            {section === "categories"
              ? (filteredRecords as EditorialCategory[]).map((category, index) => (
                  <CategoryCard
                    category={category}
                    key={category.id}
                    editing={editing}
                    formError={formError}
                    formState={formState}
                    index={index}
                    isPending={isPending}
                    onBeginEdit={beginEdit}
                    onChangeEdit={setEditing}
                    onCloseEdit={closeEdit}
                    onSubmitEdit={submitEdit}
                    pillar={data.pillars.find((item) => item.id === category.pillar_id) ?? null}
                  />
                ))
              : null}
            {section === "tags"
              ? (filteredRecords as EditorialTag[]).map((tag, index) => (
                  <TagCard
                    editing={editing}
                    key={tag.id}
                    formError={formError}
                    formState={formState}
                    index={index}
                    isPending={isPending}
                    onBeginEdit={beginEdit}
                    onChangeEdit={setEditing}
                    onCloseEdit={closeEdit}
                    onSubmitEdit={submitEdit}
                    tag={tag}
                  />
                ))
              : null}
            {section === "authors"
              ? (filteredRecords as EditorialAuthor[]).map((author, index) => (
                  <AuthorCard author={author} index={index} key={author.id} />
                ))
              : null}
          </div>
        ) : (
          <div className="editorial-empty-state">
            <span aria-hidden="true">{records.length ? "⌕" : "＋"}</span>
            <h2>
              {records.length ? `No ${copy.plural} match those filters.` : `No ${copy.plural} yet.`}
            </h2>
            <p>
              {records.length
                ? "Try a different search or clear the filters to see the full editorial vocabulary."
                : section === "authors"
                  ? "Author records will appear here when a public byline has been configured."
                  : `Create the first ${copy.singular} to make this part of the publication explicit.`}
            </p>
            {records.length ? (
              <button className="secondary-action" onClick={clearFilters} type="button">
                Show everything
              </button>
            ) : canCreate ? (
              <button className="secondary-action" onClick={openCreate} type="button">
                Add the first {copy.singular}
              </button>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

type EditCardProps = {
  editing: EditingRecord | null;
  formError: string;
  formState: FormState;
  isPending: boolean;
  index: number;
  onBeginEdit: (record: EditorialPillar | EditorialCategory | EditorialTag) => void;
  onChangeEdit: (record: EditingRecord | null) => void;
  onCloseEdit: () => void;
  onSubmitEdit: (event: React.FormEvent<HTMLFormElement>) => void;
  showSortOrder?: boolean;
  descriptionMaxLength?: number;
};

function EditDetailsForm({
  editing,
  formError,
  formState,
  isPending,
  onChangeEdit,
  onCloseEdit,
  onSubmitEdit,
  showSortOrder = true,
  descriptionMaxLength = 500,
}: Omit<EditCardProps, "index" | "onBeginEdit">) {
  if (!editing) return null;
  return (
    <form className="editorial-edit-form" onSubmit={onSubmitEdit}>
      <label>
        Description
        <textarea
          maxLength={descriptionMaxLength}
          onChange={(event) => onChangeEdit({ ...editing, description: event.target.value })}
          rows={3}
          value={editing.description}
        />
      </label>
      {showSortOrder ? (
        <label>
          Sort order
          <input
            min="0"
            onChange={(event) => onChangeEdit({ ...editing, sortOrder: event.target.value })}
            type="number"
            value={editing.sortOrder}
          />
        </label>
      ) : null}
      {formError ? (
        <p className="editorial-form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="editorial-form-actions">
        <button className="primary-action" disabled={isPending} type="submit">
          {formState === "saving" ? "Saving…" : "Save details"}
        </button>
        <button className="secondary-action" onClick={onCloseEdit} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function PillarCard({
  categories,
  index,
  onBeginEdit,
  pillar,
  ...editProps
}: EditCardProps & { categories: EditorialCategory[]; pillar: EditorialPillar }) {
  const categoryCount = categories.filter((category) => category.pillar_id === pillar.id).length;
  return (
    <article className="editorial-record-card">
      <div className="editorial-record-card__topline">
        <span className="editorial-record-card__index">{String(index + 1).padStart(2, "0")}</span>
        <RecordStatus isActive={pillar.is_active} />
      </div>
      <h3>{pillar.name}</h3>
      <p className="editorial-record-card__description">
        {pillar.description || "No description yet. Add context for the editorial team."}
      </p>
      <dl className="editorial-record-card__meta">
        <FieldPair label="Slug">
          <code>{pillar.slug}</code>
        </FieldPair>
        <FieldPair label="Categories">{categoryCount}</FieldPair>
        <FieldPair label="Order">{pillar.sort_order}</FieldPair>
        <FieldPair label="Updated">{formatDate(pillar.updated_at)}</FieldPair>
      </dl>
      <div className="editorial-record-card__footer">
        <button className="editorial-text-button" onClick={() => onBeginEdit(pillar)} type="button">
          Edit safe details
        </button>
        <span>Identity locked</span>
      </div>
      {editProps.editing?.id === pillar.id ? <EditDetailsForm {...editProps} /> : null}
    </article>
  );
}

function CategoryCard({
  category,
  index,
  onBeginEdit,
  pillar,
  ...editProps
}: EditCardProps & { category: EditorialCategory; pillar: EditorialPillar | null }) {
  return (
    <article className="editorial-record-card">
      <div className="editorial-record-card__topline">
        <span className="editorial-record-card__index">{String(index + 1).padStart(2, "0")}</span>
        <RecordStatus isActive={category.is_active} />
      </div>
      <h3>{category.name}</h3>
      <p className="editorial-record-card__description">
        {category.description || "No description yet. Add context for the editorial team."}
      </p>
      <dl className="editorial-record-card__meta">
        <FieldPair label="Pillar">{pillar?.name ?? "Pillar unavailable"}</FieldPair>
        <FieldPair label="Slug">
          <code>{category.slug}</code>
        </FieldPair>
        <FieldPair label="Order">{category.sort_order}</FieldPair>
        <FieldPair label="Updated">{formatDate(category.updated_at)}</FieldPair>
      </dl>
      <div className="editorial-record-card__footer">
        <button
          className="editorial-text-button"
          onClick={() => onBeginEdit(category)}
          type="button"
        >
          Edit safe details
        </button>
        <span>Parent locked</span>
      </div>
      {editProps.editing?.id === category.id ? <EditDetailsForm {...editProps} /> : null}
    </article>
  );
}

function TagCard({ tag, index, onBeginEdit, ...editProps }: EditCardProps & { tag: EditorialTag }) {
  return (
    <article className="editorial-record-card">
      <div className="editorial-record-card__topline">
        <span className="editorial-record-card__index">{String(index + 1).padStart(2, "0")}</span>
        <RecordStatus isActive={tag.is_active} />
      </div>
      <h3>{tag.name}</h3>
      <p className="editorial-record-card__description">
        {tag.description || "No description yet. Add context for discovery and search."}
      </p>
      <dl className="editorial-record-card__meta">
        <FieldPair label="Slug">
          <code>{tag.slug}</code>
        </FieldPair>
        <FieldPair label="Story usage">
          {tag.usageCount == null
            ? "Unavailable"
            : `${tag.usageCount} ${tag.usageCount === 1 ? "story" : "stories"}`}
        </FieldPair>
        <FieldPair label="Updated">{formatDate(tag.updated_at)}</FieldPair>
      </dl>
      <div className="editorial-record-card__footer">
        <button className="editorial-text-button" onClick={() => onBeginEdit(tag)} type="button">
          Edit description
        </button>
        <span>Tag replacement preserved</span>
      </div>
      {editProps.editing?.id === tag.id ? (
        <EditDetailsForm {...editProps} descriptionMaxLength={300} showSortOrder={false} />
      ) : null}
    </article>
  );
}

function AuthorCard({ author, index }: { author: EditorialAuthor; index: number }) {
  return (
    <article className="editorial-record-card editorial-record-card--author">
      <div className="editorial-record-card__topline">
        <span className="editorial-record-card__index">{String(index + 1).padStart(2, "0")}</span>
        <RecordStatus isActive={author.is_active} />
      </div>
      <div className="editorial-author-heading">
        <span aria-hidden="true" className="editorial-author-avatar">
          {author.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h3>{author.name}</h3>
          <code>{author.slug}</code>
        </div>
      </div>
      <p className="editorial-record-card__description">
        {author.bio_plain_text || "No public bio has been added yet."}
      </p>
      <dl className="editorial-record-card__meta">
        <FieldPair label="Stories">
          {author.storyCount == null
            ? "Unavailable"
            : `${author.storyCount} ${author.storyCount === 1 ? "story" : "stories"}`}
        </FieldPair>
        <FieldPair label="Website">
          {author.website_url ? (
            <a href={author.website_url} rel="noreferrer" target="_blank">
              Visit website ↗
            </a>
          ) : (
            "Not listed"
          )}
        </FieldPair>
        <FieldPair label="Updated">{formatDate(author.updated_at)}</FieldPair>
      </dl>
      <div className="editorial-record-card__footer editorial-record-card__footer--quiet">
        <span>Public byline record</span>
        <span>{author.avatar_media_asset_id ? "Avatar configured" : "No avatar"}</span>
      </div>
    </article>
  );
}
