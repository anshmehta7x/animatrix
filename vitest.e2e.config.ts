import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

// End-to-end tests run the built daemon and CLI: `pnpm build && pnpm test:e2e`.
export default defineConfig({
  resolve: {
    alias: {
      "@anshmehta7x/animatrix-core": src("core"),
      "@anshmehta7x/animatrix-effects": src("effects"),
      "@anshmehta7x/animatrix": src("animatrix"),
    },
  },
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
