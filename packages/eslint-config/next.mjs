import prettier from "eslint-config-prettier";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const nextConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", ".turbo/**", "coverage/**", "next-env.d.ts", "node_modules/**"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
    },
  },
  prettier,
];

export default nextConfig;
