import type { PublicMedia } from "@/lib/editorial";
export function PublicImage({
  variants,
  priority = false,
  className,
}: {
  variants: PublicMedia[];
  priority?: boolean;
  className?: string;
}) {
  const sorted = [...variants].sort((a, b) => a.width - b.width);
  const fallback = sorted.at(-1);
  if (!fallback) return null;
  return (
    <figure className={className}>
      <picture>
        {["image/avif", "image/webp"].map((type) => {
          const matches = sorted.filter((item) => item.mimeType === type);
          return matches.length ? (
            <source
              key={type}
              srcSet={matches.map((item) => `${item.url} ${item.width}w`).join(", ")}
              type={type}
            />
          ) : null;
        })}
        <img
          alt={fallback.altText}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          height={fallback.height}
          loading={priority ? "eager" : "lazy"}
          sizes="(max-width: 720px) 100vw, (max-width: 1200px) 80vw, 1100px"
          src={fallback.url}
          srcSet={sorted.map((item) => `${item.url} ${item.width}w`).join(", ")}
          width={fallback.width}
        />
      </picture>
      {fallback.caption || fallback.creditText ? (
        <figcaption>
          {fallback.caption}
          {fallback.caption && fallback.creditText ? " · " : ""}
          {fallback.creditText}
        </figcaption>
      ) : null}
    </figure>
  );
}
