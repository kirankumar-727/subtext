"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { BrandMark } from "@subtext/ui";

const SIDEBAR_PREFERENCE_KEY = "subtext:workspace-sidebar-collapsed";

type LogoutAction = (formData: FormData) => void | Promise<void>;

type WorkspaceNavigationProps = Readonly<{
  children: ReactNode;
  logout: LogoutAction;
}>;

type IconName =
  "home" | "stories" | "media" | "sources" | "settings" | "logout" | "menu" | "close" | "collapse";

type NavigationItem = Readonly<{
  href: Route;
  icon: Exclude<IconName, "menu" | "close" | "collapse" | "logout">;
  label: string;
}>;

const navigationItems: NavigationItem[] = [
  { href: "/admin", icon: "home", label: "Home" },
  { href: "/admin/stories", icon: "stories", label: "Stories" },
  { href: "/admin/media", icon: "media", label: "Media" },
  { href: "/admin/sources", icon: "sources", label: "Sources" },
  { href: "/admin/settings", icon: "settings", label: "Settings" },
];

function NavigationIcon({ name }: { name: IconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "workspace-nav-icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 24 24",
  };

  if (name === "home") {
    return (
      <svg {...commonProps}>
        <path d="m3.5 10.8 8.5-7 8.5 7" />
        <path d="M5.5 9.7v10.1h13V9.7M9.5 19.8v-5h5v5" />
      </svg>
    );
  }

  if (name === "stories") {
    return (
      <svg {...commonProps}>
        <path d="M6 3.5h8.2L18 7.3v13.2H6z" />
        <path d="M14 3.5v4h4M9 11h6M9 14.5h6M9 18h3.5" />
      </svg>
    );
  }

  if (name === "media") {
    return (
      <svg {...commonProps}>
        <rect height="16" rx="1.5" width="17" x="3.5" y="4" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m5.5 17 4.3-4.1 2.9 2.5 2.1-2 3.7 3.6" />
      </svg>
    );
  }

  if (name === "sources") {
    return (
      <svg {...commonProps}>
        <path d="M5 4.5h9a3 3 0 0 1 3 3v12H8a3 3 0 0 0-3 0z" />
        <path d="M17 19.5h2V7.5a3 3 0 0 0-3-3h-2M8 9h5M8 12.5h5" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...commonProps}>
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        <path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" />
      </svg>
    );
  }

  if (name === "logout") {
    return (
      <svg {...commonProps}>
        <path d="M14 4H5.5v16H14M10.5 12h10M16.5 8l4 4-4 4" />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg {...commonProps}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }

  if (name === "collapse") {
    return (
      <svg {...commonProps}>
        <path d="m14.5 7-5 5 5 5" />
        <path d="M19 4.5v15M5 4.5v15" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function isCurrentNavigationItem(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function readSidebarPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeToSidebarPreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function WorkspaceNavigation({ children, logout }: WorkspaceNavigationProps) {
  const pathname = usePathname() ?? "";
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const storedSidebarCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    readSidebarPreference,
    () => false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOverride, setSidebarOverride] = useState<boolean | null>(null);
  const sidebarCollapsed = sidebarOverride ?? storedSidebarCollapsed;

  function toggleSidebar() {
    const nextValue = !sidebarCollapsed;
    setSidebarOverride(nextValue);
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(nextValue));
    } catch {
      // Local preference persistence is optional.
    }
  }

  useEffect(() => {
    if (!drawerOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const returnFocusTarget = menuButtonRef.current ?? previouslyFocused;
    const drawer = drawerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () =>
      Array.from(drawer?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);

    drawer?.querySelector<HTMLElement>(".workspace-sidebar__close")?.focus();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleDrawerKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (!focusableElements.length) return;
      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDrawerKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDrawerKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      returnFocusTarget?.focus();
    };
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className={`workspace-shell${sidebarCollapsed ? " workspace-shell--collapsed" : ""}`}>
      <header className="workspace-mobile-header">
        <button
          aria-controls="workspace-navigation"
          aria-expanded={drawerOpen}
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          className="workspace-menu-button"
          onClick={() => setDrawerOpen((open) => !open)}
          ref={menuButtonRef}
          type="button"
        >
          <NavigationIcon name="menu" />
        </button>
        <div className="workspace-mobile-header__context">
          <BrandMark compact href="/admin" />
          <span>Writer workspace</span>
        </div>
      </header>

      {drawerOpen ? (
        <button
          aria-label="Close navigation"
          className="workspace-drawer-backdrop"
          onClick={closeDrawer}
          type="button"
        />
      ) : null}

      <aside
        aria-label="Writer workspace navigation"
        aria-modal={drawerOpen ? true : undefined}
        className={`workspace-sidebar${drawerOpen ? " workspace-sidebar--open" : ""}`}
        id="workspace-navigation"
        role={drawerOpen ? "dialog" : undefined}
        ref={drawerRef}
      >
        <div className="workspace-sidebar__topline">
          <BrandMark compact href="/admin" onClick={closeDrawer} />
          <button
            aria-label="Close navigation"
            className="workspace-sidebar__close"
            onClick={closeDrawer}
            type="button"
          >
            <NavigationIcon name="close" />
          </button>
        </div>
        <nav aria-label="Writer workspace destinations">
          {navigationItems.map((item) => {
            const active = isCurrentNavigationItem(pathname, item.href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className="workspace-nav-link"
                href={item.href}
                key={item.href}
                onClick={closeDrawer}
                title={item.label}
              >
                <NavigationIcon name={item.icon} />
                <span className="workspace-nav-label">{item.label}</span>
              </Link>
            );
          })}
          <span className="workspace-sidebar__rule" />
        </nav>
        <div className="workspace-sidebar__footer">
          <form action={logout}>
            <button aria-label="Logout" className="workspace-nav-link" title="Logout" type="submit">
              <NavigationIcon name="logout" />
              <span className="workspace-nav-label">Logout</span>
            </button>
          </form>
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="workspace-sidebar__collapse workspace-nav-link"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            <NavigationIcon name="collapse" />
            <span className="workspace-collapse-label">
              {sidebarCollapsed ? "Expand" : "Collapse"}
            </span>
          </button>
        </div>
      </aside>

      <div aria-hidden={drawerOpen} className="workspace-main">
        {children}
      </div>
    </div>
  );
}
