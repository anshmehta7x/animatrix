// Bundles the Electron main process (ESM) and preload (CJS, required by the sandbox).
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  sourcemap: true,
  logLevel: "warning",
};
await build({
  ...common,
  entryPoints: ["src/main/main.ts"],
  outfile: "dist-electron/main.mjs",
  format: "esm",
  external: ["electron", "dbus-next"],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
await build({
  ...common,
  entryPoints: ["src/preload/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  format: "cjs",
  external: ["electron"],
});
console.log("electron bundles written");
