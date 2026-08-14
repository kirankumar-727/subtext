import type { ComponentPropsWithoutRef } from "react";

type BrandMarkProps = Omit<ComponentPropsWithoutRef<"a">, "children"> & {
  compact?: boolean;
};

export function BrandMark({ className, compact = false, ...props }: BrandMarkProps) {
  const classes = ["st-brand-mark", className].filter(Boolean).join(" ");

  return (
    <a aria-label="Subtext Media home" className={classes} {...props}>
      <span className="st-brand-mark__word">Subtext</span>
      {!compact && <span className="st-brand-mark__suffix">Media</span>}
    </a>
  );
}
