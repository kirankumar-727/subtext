import { defaultSchema } from "rehype-sanitize";
export const subtextSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "aside", "iframe"],
  attributes: {
    ...defaultSchema.attributes,
    aside: ["className"],
    iframe: ["src", "title", "loading", "allow", "allowFullScreen", "referrerPolicy", "className"],
  },
};
