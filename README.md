# Genesis

## Open-source editor core for modern writing products

Genesis is a production-grade, backend-agnostic rich text editor for React.
It gives you a modern block-based writing experience while staying compatible
with real-world content pipelines. The same editor can work with blocks, HTML,
Markdown, and plain text, so it fits into existing product workflows without
forcing a new platform, backend, or content model.

The editor is published as [`genesis-editor`](packages/editor) on npm. See the
[package README](packages/editor/README.md) for installation, usage, upload
options, and the full API, or try it on the
[docs site and live demo](https://genesis-editor-three.vercel.app). For LLMs
and coding agents, the docs are also served as Markdown:
[`/llms.txt`](https://genesis-editor-three.vercel.app/llms.txt) is the index,
[`/llms-full.txt`](https://genesis-editor-three.vercel.app/llms-full.txt) is
every page in one file, and each docs page has a `.md` version, such as
[`/docs/html.md`](https://genesis-editor-three.vercel.app/docs/html.md).

### Why it exists

We are building the editor foundation, not a complete hosted SaaS. Genesis
Editor focuses on the actual editing experience: reliable document structure,
rich formatting, import/export, media handling, and clean extension points for
apps that need a modern writing surface.

Storage, auth, upload strategy, and deployment remain pluggable so each app can
integrate its own backend choices without changing the editor's core behavior.

### Supported formats

Genesis Editor supports multiple content formats, so it can fit into existing
systems instead of forcing a single content model:

- Blocks
- HTML
- Markdown
- Plain text

The editor can import and export in each of these formats, and it can be used in
apps that already have their own content pipeline, storage layer, or upload flow.

### Highlights

- slash menu and block nesting for rich content structures
- Markdown, HTML and plain-text import/export
- document import from Word, ODT, RTF, Markdown, and HTML files
- backend-agnostic upload hooks for images, files, and video assets
- link preview cards, embed providers, and syntax-highlighted code blocks
- multi-column layouts, preview mode, and theme support
- autosave and editor persistence for local document workflows

### v0.2.0 release summary

This release focuses on editor maturity: stronger multi-column behavior, a more
reliable media upload abstraction, broader import/export support, and a clearer
product definition as an open-source editor core rather than a full application
stack. The package remains intentionally backend-agnostic so teams can plug in
custom upload, storage, and hosting strategies when they integrate it.

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
  src/lib/llms.ts             /llms.txt, /llms-full.txt and /docs/<page>.md, converted from the rendered docs pages
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
| `/playground`           | Editor with a props and tools panel; JSON, Markdown, HTML and code; Paste HTML / Markdown |

The playground autosaves its document to `localStorage` and has Copy Markdown
and Reset buttons. Its **HTML** tab shows `getHTML()` pretty-printed, and
**Paste HTML** loads raw or JSON-encoded HTML through `setHTML` with the panel's
**HTML import** options (`htmlMode`, page-furniture removal), then shows the
import report. **Paste Markdown** does the same through `setMarkdown`. Samples
are synthetic.

### Trying uploads

The playground's **Image uploads** options switch between (changes apply live):

- **This browser**: the `data:` URL fallback (default).
- **Upload server**: an upload URL and, optionally, the JSON field holding the
  URL (for example `data.link`). "Use the built-in mock server" fills in
  `/api/mock-upload`.
- **Custom function**: an example `uploadFile` with its own request code.

The mock server (`apps/demo/src/app/api/mock-upload`) is for testing only.
It stores files in `apps/demo/.uploads/` (git-ignored; on Vercel, in the
function's temp directory or memory, so uploads there are short-lived), serves them from
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

### Deploying the docs site

The live site, <https://genesis-editor-three.vercel.app>, is a Vercel project
with **Root Directory** `apps/demo`. `apps/demo/vercel.json` builds the package
before the site (`pnpm --filter genesis-editor build && pnpm run build`).

## Limitations

- The playground holds one document per browser; there is no backend or sync.
- `localStorage` is per-origin and limited to a few MB.
- Video, audio, and file blocks use the same upload destination, but the mock
  server only accepts images.
- A failed upload is kept in memory for Retry until the page reloads.

## License

[MIT](LICENSE)
