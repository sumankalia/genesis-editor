# Contributing

Thanks for helping with Genesis. This repository is a pnpm workspace:

| Path              | What it is                                                       |
| ----------------- | ---------------------------------------------------------------- |
| `packages/editor` | `genesis-editor`, the published React component                  |
| `apps/demo`       | Docs and playground site (Next.js) with a mock upload server     |

## Setup

You need Node.js 20.9+ and pnpm 10 (`corepack enable` picks up the
version pinned in `package.json`).

```bash
pnpm install
pnpm dev        # builds the package, then runs the docs site on http://localhost:4317
```

The demo imports the package's built output, so rebuild it after changing
library code: run `pnpm --filter genesis-editor build`, or keep
`pnpm --filter genesis-editor dev` running for the JavaScript. The stylesheet is
built by `node scripts/build-css.mjs` in `packages/editor`.

## Checks

Run these before opening a pull request. CI runs the same ones.

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test                      # unit tests (Vitest) for the package
pnpm --filter demo e2e         # browser checks; needs the docs site running on :4317
```

The browser checks in `apps/demo/e2e` drive the site with Playwright: `editor.mjs` and
`uploads.mjs` exercise `/playground`, and `docs.mjs` covers the landing page, docs,
and playground options. They use
Playwright's Chromium (`pnpm --filter demo exec playwright-core install chromium`),
or an installed Chrome with `E2E_CHANNEL=chrome`. Point them at another server
with `E2E_BASE_URL`. Screenshots go to `apps/demo/e2e/screenshots/`. Against a
production build (`pnpm --filter demo start`), start the server with
`GENESIS_DEMO_ALLOW_LOOPBACK=1`: the re-host checks copy images from 127.0.0.1,
which the mock `uploadFromUrl` endpoint otherwise refuses outside development.

`pnpm --filter genesis-editor test:node` packs the package, installs the tarball
into a scratch app for each Node 18, 20 and 22 it finds under `~/.nvm` (or the
binaries you pass with `--node <path>`), and checks `require` and `import` of
every entry point, server parsing, SSR and a jsdom client render. Run it before a
release and after changing the build or dependencies.

## Guidelines

- Keep the package free of framework and app code: no Next.js, no app-specific
  UI, and nothing that assumes a global stylesheet. Demo-only features belong in
  `apps/demo`.
- Styles in `packages/editor` are compiled into `dist/style.css` and scoped to
  `.genesis-editor`. Tailwind classes used in the package's components are
  picked up automatically; plain CSS goes in `src/styles/editor.css` and must
  be scoped by hand.
- Public API changes need a README update and a `CHANGELOG.md` entry under an
  "Unreleased" heading.
- Use small, focused commits with messages that say what changed and why.

## Releasing

1. Update the version in `packages/editor/package.json` and move the changelog
   entries under the new version.
2. From `packages/editor`, run `npm pack --dry-run` and check the file list,
   and run `pnpm test:node`.
3. Publish with `pnpm publish --access public` from `packages/editor`.
