import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const dir = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": dir, "server-only": path.join(dir, "test/server-only.ts") } },
});
