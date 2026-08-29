import type { SourceType } from "@/lib/cms/types";

export const SOURCE_TYPE_OPTIONS: ReadonlyArray<{ value: SourceType; label: string }> = [
  { value: "book", label: "Book" },
  { value: "journal_article", label: "Journal article" },
  { value: "news_article", label: "News article" },
  { value: "website", label: "Website" },
  { value: "report", label: "Report" },
  { value: "archive", label: "Archive" },
  { value: "interview", label: "Interview" },
  { value: "dataset", label: "Dataset" },
  { value: "video", label: "Video" },
  { value: "other", label: "Other" },
];

export function sourceTypeLabel(sourceType: SourceType) {
  return SOURCE_TYPE_OPTIONS.find((item) => item.value === sourceType)?.label ?? sourceType;
}
