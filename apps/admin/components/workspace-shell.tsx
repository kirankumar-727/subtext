import { BrandMark } from "@subtext/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/auth/actions";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <BrandMark compact href="/admin" />
        <nav aria-label="Writer workspace">
          <Link href="/admin">Home</Link>
          <Link href="/admin/stories">Stories</Link>
          <Link href="/admin/media">Media</Link>
          <Link href="/admin/sources">Sources</Link>
          <span className="workspace-sidebar__rule" />
          <Link href="/admin/settings">Settings</Link>
        </nav>
        <form action={logout}>
          <button type="submit">Logout</button>
        </form>
      </aside>
      <div className="workspace-main">{children}</div>
    </div>
  );
}
