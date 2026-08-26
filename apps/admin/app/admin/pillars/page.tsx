import { EditorialManager } from "@/components/editorial-manager";
import { getEditorialStructureData } from "@/lib/cms/queries";

export default async function PillarsPage() {
  const data = await getEditorialStructureData();
  return <EditorialManager data={data} section="pillars" />;
}
