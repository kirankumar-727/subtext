import { notFound } from "next/navigation";
import { StoryEditor } from "@/components/story-editor";
import { getStory, getWorkspaceReferenceData } from "@/lib/cms/queries";

type StoryPageProps = { params: Promise<{ id: string }> };
export default async function StoryPage({ params }: StoryPageProps) {
  const { id } = await params;
  const [story, reference] = await Promise.all([getStory(id), getWorkspaceReferenceData()]);
  if (!story) notFound();
  return <StoryEditor reference={reference} story={story} />;
}
