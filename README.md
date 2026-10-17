# Genesis

Genesis is a Notion-style, block-based rich text editor for React. Every
paragraph, heading, list item, quote, code block, to-do, and image is its own
block that can be inserted, converted, reordered, and nested independently.

The editor is published as [`genesis-editor`](packages/editor) on npm. See the
[package README](packages/editor/README.md) for installation, usage, upload
options, and the full API.

```tsx
import { BlockEditor } from "genesis-editor";
import "genesis-editor/style.css";

<BlockEditor persist uploadUrl="/api/uploads" />;
```

## Repository layout

```
packages/editor/              genesis-editor, the published package
  src/block-editor.tsx        <BlockEditor>: BlockNote setup, value/onChange, persistence, uploads
  src/plugins/                Tool selection, built-in tools, definePlugin, content fallback
  src/components/             Upload panel, formatting toolbar, mobile toolbar, link dialog
  src/lib/                    Upload logic, upload status store, persistence, theme hook
  src/styles/                 Stylesheet sources, compiled by scripts/build-css.mjs
  test/                       Unit tests (Vitest)
apps/demo/                    Docs and playground site (Next.js) that consumes the package
  src/app/docs/               Docs pages: getting started, usage, uploads, tools & plugins, theming, API, shortcuts
  src/app/playground/         Playground route
  src/components/examples/    Live examples; their source is what the docs show as code
  src/components/playground/  Props panel, output views, save indicator
  src/components/site/        Header, sidebar, code blocks, Preview/Code tabs
  src/lib/api-docs.ts         API reference tables, generated from the package's exported types
  src/app/api/mock-upload/    Local mock upload server
  e2e/                        Browser checks (Playwright)
```

## Running the docs site

Requires Node.js 20.9+ and pnpm 10.

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:4317>:

| Route                   | Contents                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `/`                     | Landing page with install command and a live editor         |
| `/docs/getting-started` | Guides and API reference, each example with Preview/Code    |
| `/playground`           | Editor with a props and tools panel, JSON/Markdown, and code |

The playground autosaves its document to `localStorage` and has Copy Markdown
and Reset buttons.

### Trying uploads

The playground's **Image uploads** options switch between (changes apply live):

- **This browser**: the `data:` URL fallback (default).
- **Upload server**: an upload URL and, optionally, the JSON field holding the
  URL (for example `data.link`). "Use the built-in mock server" fills in
  `/api/mock-upload`.
- **Custom function**: an example `uploadFile` with its own request code.

The mock server (`apps/demo/src/app/api/mock-upload`) is for local testing only.
It stores files in `apps/demo/.uploads/` (git-ignored), serves them from
`/api/mock-upload/<id>`, accepts raster images up to 10 MB, and supports:

| Parameter      | Effect                                         |
| -------------- | ---------------------------------------------- |
| `fail=1`       | Responds `500` so you can see the error state  |
| `delay=<ms>`   | Waits before responding (max 10 s)             |
| `shape=nested` | Responds `{ "data": { "link": "…" } }` instead |

## Scripts

| Command                  | What it does                                        |
| ------------------------ | --------------------------------------------------- |
| `pnpm dev`               | Build the package, then run the docs site on :4317 |
| `pnpm build`             | Build the package and the docs site                 |
| `pnpm lint`              | ESLint in every workspace                           |
| `pnpm typecheck`         | TypeScript in every workspace                       |
| `pnpm test`              | Package unit tests                                  |
| `pnpm --filter demo e2e` | Browser checks against the running docs site        |

See [CONTRIBUTING.md](CONTRIBUTING.md) for development details.

## Limitations

- The playground holds one document per browser; there is no backend or sync.
- `localStorage` is per-origin and limited to a few MB.
- Video, audio, and file blocks use the same upload destination, but the mock
  server only accepts images.
- A failed upload is kept in memory for Retry until the page reloads.

## License

[MIT](LICENSE)
