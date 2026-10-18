# Notes for coding agents

animatrix is a TypeScript (strict) pnpm monorepo that drives the ASUS ROG AniMe Matrix on Linux. Start with [docs/architecture.md](docs/architecture.md).

## Commands

```sh
corepack enable && pnpm install
pnpm build          # tsc -b for core, effects, animatrix, daemon, cli
pnpm typecheck      # also the tray and examples
pnpm lint && pnpm format:check
pnpm test           # vitest; hardware-free (MockTransport)
pnpm -C apps/tray build
```

## Layout

- `packages/core`: pure logic (profiles, geometry, canvas, mapping, packets). No I/O.
- `packages/effects`: the effect plugin contract, the runner, media decoding and the built-in effects.
- `packages/animatrix`: the public library (transports, `AnimeDevice`, `Matrix`, daemon client).
- `packages/daemon`: animatrixd (controller, power policy, D-Bus service).
- `packages/cli`: the `animatrix` command.
- `apps/tray`: Electron + React panel. The main process uses D-Bus only and never loads native modules.

## Rules

- Only send the opcodes in [docs/protocol.md](docs/protocol.md). Never probe the device with unknown commands.
- Exactly one process writes to the device (animatrixd). Talk to it over D-Bus (`dev.animatrix.Matrix1`, see [docs/dbus-api.md](docs/dbus-api.md)) rather than opening the device while it runs.
- Errors are typed (`AnimatrixError` subclasses with a `code`). Don't throw plain `Error`s from library code.
- Model differences live in profile data (`packages/core/src/profiles`), not in branches.
- No `any`. Keep files at about 200 lines or less. Add tests for both good and bad paths.
- New effects: one file in `packages/effects/src/effects/` plus one line in `registry.ts`. See [CONTRIBUTING.md](CONTRIBUTING.md).
