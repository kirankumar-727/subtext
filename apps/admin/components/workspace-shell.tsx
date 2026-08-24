import type { ReactNode } from "react";

import { logout } from "@/app/auth/actions";
import { WorkspaceNavigation } from "@/components/workspace-navigation";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return <WorkspaceNavigation logout={logout}>{children}</WorkspaceNavigation>;
}
