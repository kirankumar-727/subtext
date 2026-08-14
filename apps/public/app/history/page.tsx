import type { Metadata } from "next";
import { PillarPage } from "@/components/pillar-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "History",
  description:
    "Empires, heritage, archaeology and sacred places—research-driven history from Subtext Media.",
};
export default function Page() {
  return <PillarPage pillar="history" />;
}
