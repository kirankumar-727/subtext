import type { Metadata } from "next";
import { PillarPage } from "@/components/pillar-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Psychology",
  description:
    "Human behaviour, cognitive biases and consumer psychology examined with evidence and restraint.",
};
export default function Page() {
  return <PillarPage pillar="psychology" />;
}
