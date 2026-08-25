"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type WorkspaceSheetProps = Readonly<{
  children: ReactNode;
  description?: string | undefined;
  eyebrow?: string | undefined;
  onClose: () => void;
  open: boolean;
  size?: "default" | "wide";
  title: string;
}>;

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WorkspaceSheet({
  children,
  description,
  eyebrow,
  onClose,
  open,
  size = "default",
  title,
}: WorkspaceSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusableElements = () =>
      Array.from(sheet?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);

    const focusFirstControl = () => {
      const firstControl = getFocusableElements()[0];
      firstControl?.focus();
    };
    const focusFrame = window.requestAnimationFrame(focusFirstControl);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (!focusableElements.length) return;
      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;
      if (!sheet?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const titleId = `workspace-sheet-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className="workspace-sheet-layer">
      <button
        aria-label={`Close ${title}`}
        className="workspace-sheet-backdrop"
        onClick={onClose}
        type="button"
      />
      <div
        aria-describedby={description ? `${titleId}-description` : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`workspace-sheet workspace-sheet--${size}`}
        ref={sheetRef}
        role="dialog"
      >
        <header className="workspace-sheet__header">
          <div>
            {eyebrow ? <p className="workspace-sheet__eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <p id={`${titleId}-description`} className="workspace-sheet__description">
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label={`Close ${title}`}
            className="workspace-sheet__close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="workspace-sheet__body">{children}</div>
      </div>
    </div>
  );
}
