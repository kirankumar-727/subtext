import { EditorialManager } from "@/components/editorial-manager";
import { getEditorialStructureData } from "@/lib/cms/queries";

export default async function AuthorsPage() {
  const data = await getEditorialStructureData();
  return <EditorialManager data={data} section="authors" />;
}
