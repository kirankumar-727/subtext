import type { Metadata } from "next";
import { PillarPage } from "@/components/pillar-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Society",
  description: "Important contemporary developments explained with context, relevance and depth.",
};
export default function Page() {
  return <PillarPage pillar="society" />;
}
