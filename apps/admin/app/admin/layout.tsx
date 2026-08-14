import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAdminPage } from "@/lib/auth/authorization";

type ProtectedAdminLayoutProps = Readonly<{ children: ReactNode }>;
export default async function ProtectedAdminLayout({ children }: ProtectedAdminLayoutProps) {
  await requireAdminPage();
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
