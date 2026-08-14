import type { Metadata } from "next";
import { PillarPage } from "@/components/pillar-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Business",
  description:
    "Companies, business models, brands and economics—explained through the mechanisms beneath them.",
};
export default function Page() {
  return <PillarPage pillar="business" />;
}
