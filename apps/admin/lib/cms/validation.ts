import { slugify } from "@subtext/content";
import { z } from "zod";

export const storyDraftSchema = z.object({
  articleId: z.uuid(),
  rowVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(180),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  excerpt: z.string().max(360),
  markdown: z.string().min(1),
  pillarId: z.uuid(),
  categoryId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()).max(30),
  sourceIds: z.array(z.uuid()).max(100),
  coverMediaAssetId: z.uuid().nullable(),
  seoTitle: z.string().max(120),
  seoDescription: z.string().max(320),
});

export const createStorySchema = z.object({
  title: z.string().trim().min(1).max(180),
  pillarId: z.uuid(),
});

export const sourceSchema = z.object({
  sourceType: z.enum([
    "book",
    "journal_article",
    "news_article",
    "website",
    "report",
    "archive",
    "interview",
    "dataset",
    "video",
    "other",
  ]),
  title: z.string().trim().min(1).max(500),
  authorText: z.string().trim().max(300).optional(),
  publisher: z.string().trim().max(300).optional(),
  url: z.union([z.url(), z.literal("")]).optional(),
  archiveUrl: z.union([z.url(), z.literal("")]).optional(),
  isbn: z.string().trim().max(40).optional(),
  doi: z.string().trim().max(200).optional(),
});

export function initialSlug(title: string) {
  return slugify(title) || `untitled-${Date.now().toString(36)}`;
}
