# Contributing

```sh
corepack enable && pnpm install
pnpm build          # tsc -b for all packages
pnpm test           # vitest; no hardware needed (MockTransport)
pnpm lint && pnpm format:check && pnpm typecheck
pnpm -C apps/tray build && pnpm -C apps/tray start   # the panel
node packages/daemon/dist/main.js --mock            # a daemon with no device, for UI work
```

If `pnpm install` skips Electron's download (`apps/tray/node_modules/electron/dist` is missing), run `node apps/tray/node_modules/electron/install.js`.

House rules: strict TypeScript, no `any`, files of roughly 200 lines or less, typed errors only (`AnimatrixError` subclasses), and tests for both the good and the bad paths. Only send opcodes documented in [docs/protocol.md](docs/protocol.md). Don't probe the device.

## Add an effect

1. Create `packages/effects/src/effects/<name>.ts` that exports an `Effect`:

   ```ts
   import { MAPPING_PARAM, num } from "../params.js";
   import type { Effect } from "../types.js";

   export const rippleEffect: Effect = {
     id: "ripple", // kebab-case, stable
     name: "Ripple",
     description: "Concentric rings",
     category: "generative", // groups it in the UI
     fps: 30, // 0 = static: render once, then idle
     params: {
       // the panel builds the settings UI from this
       speed: { type: "number", label: "Speed", min: 0.1, max: 4, step: 0.1, default: 1 },
       ...MAPPING_PARAM,
     },
     create(params, ctx) {
       const speed = num(params, "speed");
       return {
         render(t, canvas) {
           canvas.clear();
           const r = ((t / 1000) * speed * 10) % 30;
           canvas.circle(ctx.safe.x + ctx.safe.width / 2, ctx.safe.y + ctx.safe.height / 2, r);
         },
       };
     },
   };
   ```

2. Register it with one line in `packages/effects/src/registry.ts` (`BUILTIN_EFFECTS`).
3. Add it to `NO_HARDWARE_DEPS` in `packages/effects/test/smoke.test.ts` if it needs no audio, MPRIS or files.

Notes:

- Effects draw into a greyscale `Canvas` and never touch LED addresses.
- Use `ctx.safe` (the largest fully visible rectangle) for anything that must not fall into the panel's cut corner. `ctx.visible` is the per-pixel mask.
- The same canvas is passed every frame and is not cleared for you, so trails can use `canvas.fade()`.
- Return `{ changed: false }` to skip a frame, `{ delay }` for custom timing, or `{ done: true }` to stop.
- Release child processes and subscriptions in `dispose()`.
- Param types are `number`, `boolean`, `select`, `string` and `file`. `visibleWhen: { otherParam: value }` hides a field in the UI.

Scripts can also run an effect without registering it: `await matrix.run(myEffect)`.

## Add a model profile

1. Create `packages/core/src/profiles/<id>.ts` exporting a `ModelProfile`. Everything about a model is data:
   - `rows`: per-row `first` column, LED `count` and buffer `pitch`, via `rowsFrom(first, count, pitch?)`
   - `ledStart`: buffer index of row 0
   - `oddRowShift`: ±0.5, following the source's convention
   - `pitchCm`: LED spacing
   - `pane`: `{ length, count }` for `C0 02` packets
   - `canvas`: planar size with near-square pixels
   - `orientation`: `flipX`/`flipY`
   - `dmiMatch`: DMI substrings
   - also `maxValue`, `maxFps`, `tested: false` and `notes`
2. Add it to `PROFILES` in `packages/core/src/profiles/index.ts`. If the model is a Slash laptop that shares the USB ID, add it to `SLASH_MODELS` instead.
3. Add tests in `packages/core/test/geometry.test.ts`: the LED total against the vendor figure, the row starts, and golden pane headers.
4. On hardware:
   - run `animatrix --direct --model <id> test-pattern` and fix `orientation`
   - measure timing with `scripts/hw-check.ts bench` (its geometry constants are GA402's; adapt them)
   - record the results in `docs/hardware-notes.md`
   - set `tested: true` only after that

Slash Lighting uses a different command family (`D*`), not frames. It would need a separate device class rather than a profile.

## Commits and PRs

Atomic commits with clear messages. Rebase on `main`. Say in the PR what you tested, and on which model.
