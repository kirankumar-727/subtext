import type { ReactNode } from "react";

import { logout } from "@/app/auth/actions";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { getDashboardData } from "@/lib/cms/queries";

export async function WorkspaceShell({ children }: { children: ReactNode }) {
  let counts: { drafts: number | null; published: number | null; trash: number | null } = {
    drafts: null,
    published: null,
    trash: 0,
  };

  try {
    const data = await getDashboardData();
    counts = { drafts: data.draftCount, published: data.publishedCount, trash: 0 };
  } catch {
    // The navigation should never hide a protected page if its optional counts fail to load.
  }

  return (
    <WorkspaceNavigation counts={counts} logout={logout}>
      {children}
    </WorkspaceNavigation>
  );
}
