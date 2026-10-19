# genesis-editor

A Notion-style block editor for React. Every paragraph, heading, list item,
quote, code block, to-do, and image is its own block that can be inserted from a
slash menu, dragged to reorder, and nested with `Tab`.

Built on [BlockNote](https://www.blocknotejs.org/) (TipTap/ProseMirror) with a
shadcn/ui-style skin. The stylesheet is precompiled and scoped, so you don't need
Tailwind or shadcn/ui in your app.

- Slash menu (`/`), drag handles, `Tab` / `Shift+Tab` nesting
- Floating formatting toolbar and shortcuts (`Mod+B`, `Mod+I`, `Mod+U`,
  `Mod+Shift+S`, `Mod+E` for code, `Mod+K` for links)
- Markdown shortcuts: `#` headings, `-` / `1.` / `[]` lists, `>` quotes,
  ```` ``` ```` code, `---` dividers
- Images by URL or upload (picker, drop, paste) to your server or your own function,
  with optional re-hosting of pasted images
- HTML in and out (`format="html"`, `getHTML`/`setHTML`), and pastes from Google
  Docs, Word, WordPress and web pages cleaned into blocks
- Embeds: YouTube, Vimeo, X, Instagram, Spotify and 28 more, from links, iframes
  or a site's embed code, always in sandboxed frames
- Text and background colours, font sizes
- Light, dark, or system theme; read-only mode
- Optional autosave to `localStorage`
- A bottom block toolbar on small screens

## Install

```bash
npm install genesis-editor
# or: pnpm add genesis-editor / yarn add genesis-editor
```

Requires React 18 or 19 and, on servers, Node 18 or newer. BlockNote is
installed as a dependency. Every entry point loads with both `import` and
`require`.

> npm may print a peer warning about `tailwindcss`, which `@blocknote/shadcn`
> declares. genesis-editor ships compiled CSS, so your app doesn't need Tailwind.

## Usage

Import the component and the stylesheet once:

```tsx
import { BlockEditor } from "genesis-editor";
import "genesis-editor/style.css";

export function Notes() {
  return <BlockEditor persist />;
}
```

`persist` saves the document to `localStorage` after each edit and restores it on
the next visit. Leave it out to manage content yourself:

```tsx
import { useState } from "react";
import { BlockEditor, type Block } from "genesis-editor";

function Page({ saved }: { saved: Block[] }) {
  const [blocks, setBlocks] = useState(saved);
  return <BlockEditor value={blocks} onChange={setBlocks} />;
}
```

Use `initialContent` instead of `value` if you only need to seed the editor and
read changes from `onChange`.

### Next.js and other SSR frameworks

The package is marked `"use client"` and is safe to import and render on the
server. Server rendering and hydration draw an empty
`<div class="genesis-editor" data-genesis-pending>` (with your `className`), and
the editor mounts in the browser right after hydration. Reserve its height with
CSS if the jump matters. Loading it with `next/dynamic` and `ssr: false` still
works if you'd rather not ship it in the server bundle:

```tsx
"use client";

import dynamic from "next/dynamic";

const BlockEditor = dynamic(() => import("genesis-editor").then((m) => m.BlockEditor), {
  ssr: false,
});
```

### Ref

Pass a ref to reach editor actions:

```tsx
import { useRef } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";

function WithExport() {
  const editor = useRef<BlockEditorHandle>(null);
  return (
    <>
      <button onClick={() => console.log(editor.current?.getMarkdown())}>Export</button>
      <BlockEditor ref={editor} />
    </>
  );
}
```

## HTML

With `format="html"`, `value`, `defaultValue` and `onChange` carry HTML strings:

```tsx
<BlockEditor format="html" defaultValue={savedHtml} onChange={(html) => save(html)} />
```

Pasted HTML, the HTML `value` and `setHTML` go through `genesis-editor/parser`.
It maps what the editor can show, sanitizes the rest, removes page furniture
from pastes (with an "Undo cleanup" toast), and reports what changed through
`onImportReport`. `htmlMode="strict"` also snaps custom colours to the palette.
On a server, pass a DOM with `dom`. The `linkedom` and `jsdom` adapters work
from both `import` and `require` (install the library you pick):

```ts
import { parseHTML, toHTML } from "genesis-editor/parser";
import { linkedomDom } from "genesis-editor/parser/linkedom";
// or: import { jsdomDom } from "genesis-editor/parser/jsdom";

const { blocks, report } = parseHTML(html, { dom: linkedomDom });
const back = toHTML(blocks); // reads back to the same blocks
```

`dom` also takes a function that turns an HTML string into a `Document`, or a
`DOMParser` instance or class, so any DOM library works:

```ts
import { DOMParser } from "linkedom";
import { JSDOM } from "jsdom";

parseHTML(html, { dom: DOMParser }); // a DOMParser class or instance
parseHTML(html, { dom: (doc) => new JSDOM(doc).window.document }); // a factory
```

A factory receives a complete document (`<!doctype html><html>…<body>…`).
`toDomAdapter(dom)` normalizes any of these forms into `{ parse(html) }`. In the
browser, `dom` defaults to the page's `DOMParser`.

- Whitespace follows HTML's rules, and `&nbsp;` padding next to other spaces
  collapses too (`Land,&nbsp; some` reads as one space). `toHTML` keeps
  intentional spaces in `<span style="white-space:pre-wrap">`, so its output
  reads back exactly.
- HTML that arrives JSON-encoded (copied from an API response, DevTools or a
  `.json` file) is decoded instead of showing `\n` and `\"` as text. This
  covers a quoted JSON string, JSON holding HTML strings such as
  `[{ "HTML": "…" }]`, and the inside of a JSON string when its escapes are
  clearly structural. The report gets a warning; `decodeEscaped: false` turns it
  off. `decodeEscapedHTML(text)` is exported for your own inputs.

## Image uploads

Clicking an empty image block opens a panel with **Upload** and **Link** tabs.
Files dropped or pasted into the document upload too. An uploaded image is stored
as an ordinary URL image (`props.url`), so it behaves exactly like a linked one.

While an upload runs, the block shows an uploading state. If it fails, the block's
panel shows the error with a **Retry** button, and `onUploadError` is called.

Pick a destination with one of these props. If you pass both, `uploadFile` wins.

### `uploadUrl`

```tsx
<BlockEditor uploadUrl="https://api.example.com/uploads" />
```

The editor sends `POST <uploadUrl>` with a `multipart/form-data` body holding the
file in a field named `file`, and expects a 2xx JSON response:

```json
{ "url": "https://cdn.example.com/images/abc123.png" }
```

A relative `url` is resolved against `uploadUrl`. For a non-2xx status the error
shows the response's `error` field when present. Servers on another origin must
allow CORS from your page.

For a different response shape, pass `mapUploadResponse`. It receives the parsed
body (JSON, or text when the body isn't JSON) and the `Response`:

```tsx
<BlockEditor
  uploadUrl="https://api.example.com/uploads"
  mapUploadResponse={(body) => (body as { data: { link: string } }).data.link}
/>
```

`mapResponsePath("data.link")` builds the same mapper from a dot path.

### `uploadFile`

For signed URLs, SDKs, or auth headers, pass a function that takes the `File` and
resolves to its URL. Throw to show an error.

```tsx
async function uploadToS3(file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await fetch("/api/sign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type }),
  }).then((res) => res.json());

  const res = await fetch(uploadUrl, { method: "PUT", body: file });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return publicUrl;
}

<BlockEditor uploadFile={uploadToS3} />;
```

### No destination

With neither prop, files are embedded in the document as `data:` URLs, limited
to 2 MB each. The Upload tab tells the user so. This is meant for prototypes;
configure a destination for real use.

## Tools and plugins

By default every built-in tool is on. Pass `tools` to choose which ones the
editor offers. A disabled tool disappears everywhere: the slash menu, the "+"
menu, Markdown shortcuts, the formatting toolbar, the mobile toolbar, and paste
(unsupported pasted blocks become paragraphs). Paragraphs are always on.

```tsx
// Only headings and images, plus bold and links.
<BlockEditor tools={["heading", "image", "bold", "link"]} />

// Object form, with per-tool options.
<BlockEditor tools={{ heading: { levels: [1, 2] }, image: true, bold: true }} />
```

Block tools: `heading`, `bulletList`, `numberedList`, `checkList`,
`toggleList`, `quote`, `codeBlock`, `divider`, `table`, `image`, `video`,
`audio`, `file`, `embed`. Inline tools: `bold`, `italic`, `underline`, `strike`,
`code`, `link`, `colors`, `fontSize`. They're exported as `BLOCK_TOOLS`,
`INLINE_TOOLS`, and `BUILT_IN_TOOLS`, so "everything except tables" is
`BUILT_IN_TOOLS.filter((tool) => tool !== "table")`.

`colors` stores theme-aware palette names, your brand swatches, or exact hex;
`fontSize` adds a 6–20 px dropdown to the selection toolbar:

```tsx
<BlockEditor
  tools={{ colors: { swatches: [{ name: "brand", hex: "#ff5a1f" }] }, fontSize: true, bold: true }}
  colorContrast="auto"
/>
```

`embed` takes links, iframe code, and sites' own embed code (the `<blockquote>`
plus `<script>` from X, Instagram, Bluesky, Threads, Reddit, Mastodon and
others) in pastes, `value` and `/embed`. Pasted scripts are never run. Posts are
drawn in sandboxed iframes rebuilt from their URL, their text is kept as a
fallback, and `getHTML()` writes them back as the site's embed code
(`getHTML({ embedScripts: true })` adds the official scripts).

Existing content that uses a disabled tool is converted when it loads: unknown
blocks become paragraphs that keep their text, tables become one paragraph per
row, and headings move to the nearest allowed level.

### Toolbar

`toolbar` chooses and orders the formatting toolbar items. Items whose tool is
off are skipped. `placement: "fixed"` pins the toolbar above the content instead
of showing it on selection, and `toolbar={false}` removes it.

```tsx
<BlockEditor toolbar={["bold", "italic", "link"]} />
<BlockEditor toolbar={{ placement: "fixed", items: ["blockType", "bold", "italic", "link"] }} />
```

The default order is `DEFAULT_TOOLBAR`: `blockType`, `tableMerge`, `file`,
`bold`, `italic`, `underline`, `strike`, `code`, `alignLeft`, `alignCenter`,
`alignRight`, `fontSize`, `colors`, `nest`, `unnest`, `link`, followed by plugin items.

### Plugins

`definePlugin` describes a custom tool: blocks (from `createReactBlockSpec`),
slash menu items, toolbar items, Markdown shortcuts, and keyboard shortcuts.
Pass plugins in `plugins`. Each plugin is a tool named by its `name`, so it
follows `tools` (when `tools` is set, list the plugin there too) and its toolbar
items can be placed with `toolbar`. The built-in tools use the same mechanism,
and a plugin with a built-in tool's name replaces it.

```tsx
import { createReactBlockSpec, definePlugin, ToolbarButton } from "genesis-editor";

const callout = createReactBlockSpec(
  { type: "callout", propSchema: {}, content: "inline" },
  { render: ({ contentRef }) => <div className="callout" ref={contentRef} /> },
);

export const calloutPlugin = definePlugin({
  name: "callout",
  blocks: { callout: callout() },
  slashItems: [{ key: "callout", title: "Callout", group: "Basic blocks", block: { type: "callout" } }],
  markdownShortcuts: [{ find: /^!>\s$/, block: { type: "callout" } }],
  toolbarItems: {
    callout: () => (
      <ToolbarButton
        label="Callout"
        icon="💡"
        onClick={(editor) =>
          editor.updateBlock(editor.getTextCursorPosition().block, { type: "callout" })
        }
      />
    ),
  },
});

<BlockEditor plugins={[calloutPlugin]} />
<BlockEditor tools={["heading", "callout"]} plugins={[calloutPlugin]} />
```

`tools` and the plugin names are read when the editor is created. Changing them
rebuilds the editor: the document is kept, the undo history isn't.

## API

### `<BlockEditor>` props

| Prop                    | Type                                                      | Default    | Description                                                                                          |
| ----------------------- | --------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `format`                | `"blocks" \| "html"`                                      | `"blocks"` | Shape of `value`, `initialContent`/`defaultValue` and `onChange`. See [HTML](#html).                 |
| `initialContent`        | `EditorContent`                                           | —          | Content for the first render. Ignored when `value` is set or a persisted document exists.            |
| `defaultValue`          | `string`                                                  | —          | With `format="html"`: HTML for the first render.                                                     |
| `value`                 | `EditorContent \| string`                                 | —          | Controlled content (HTML with `format="html"`). A new value that differs from the document replaces it. |
| `onChange`              | `(blocks, editor) => void` / `(html, info) => void`       | —          | Called after every edit with the full document. Not called for changes made through `value`.         |
| `htmlMode`              | `"clean" \| "strict"`                                     | `"clean"`  | How pasted and loaded HTML is cleaned.                                                               |
| `baseUrl`               | `string`                                                  | —          | Resolves relative links and image sources in pasted and loaded HTML.                                 |
| `clean`                 | `CleanOptions`                                            | —          | Page-furniture removal for pastes: `{ noise: false }`, `keepSelectors`, `dropSelectors`.             |
| `cleanupToast`          | `boolean`                                                 | `true`     | Show "Removed N sections · Undo cleanup" after a paste that removed furniture.                       |
| `onImportReport`        | `(report: FidelityReport) => void`                        | —          | Called after HTML is imported (value, `setHTML`, or paste).                                          |
| `meta`                  | `MetaOptions`                                             | —          | Per-block metadata kept from imports: `policy: "keep" \| "strip-on-export" \| "off"`.                |
| `embeds`                | `EmbedOptions`                                            | `"open"`   | `policy: "allowlist"` allows provider embeds only (recommended for user content). Read once.         |
| `embedProviders`        | `EmbedProvider[]`                                         | —          | Extra providers from `defineEmbedProvider`. Read once.                                               |
| `colorContrast`         | `"auto" \| "off"`                                         | `"off"`    | `"auto"` adjusts hex text below 3:1 contrast with the theme, at render time only.                     |
| `persist`               | `boolean \| { key?: string; debounceMs?: number }`        | `false`    | Autosave to `localStorage`. Default key `"genesis-editor:document"`, default delay 400 ms.          |
| `onPersistStatusChange` | `(status: PersistStatus) => void`                         | —          | Autosave progress: `idle`, `saving`, `saved` (with `savedAt`), or `error`.                          |
| `uploadUrl`             | `string`                                                  | —          | Endpoint for multipart `POST` uploads (field `file`, response `{ url }`).                           |
| `uploadFile`            | `(file: File, ctx) => Promise<string>`                    | —          | Custom upload function. Takes precedence over `uploadUrl`. `ctx` has `signal`, `onProgress`, `blockId`, `source`. |
| `mapUploadResponse`     | `(body: unknown, response: Response) => string \| Promise<string>` | — | Reads the URL from an `uploadUrl` or `uploadFromUrl` response.                                    |
| `uploadHeaders`         | `object \| () => Promise<object>`                         | —          | Extra request headers (auth) for `uploadUrl` and `uploadFromUrl`.                                   |
| `uploadFromUrl`         | `string`                                                  | —          | Endpoint that copies a remote image: JSON `POST { url, alt?, filename? }` → `{ url }`.              |
| `uploadRemote`          | `(url: string, ctx) => Promise<string>`                   | —          | Custom re-hosting of a remote image. Takes precedence over `uploadFromUrl`.                          |
| `rehostImages`          | `"auto" \| "off" \| (url) => boolean`                     | `"auto"`   | Which pasted and loaded images are copied to your storage, when a destination is configured.       |
| `trustedHosts`          | `string[] \| (url) => boolean`                            | —          | Hosts whose images are never re-hosted (`"cdn.example.com"`, `"*.example.com"`).                     |
| `uploadConcurrency`     | `number`                                                  | `4`        | Re-uploads running at once.                                                                          |
| `onUploadError`         | `(event: UploadErrorEvent) => void`                       | —          | Called when an upload fails: `{ kind: "file", error, file, blockId, retry }` or `{ kind: "rehost", error, url, blockId, retry }`. |
| `theme`                 | `"light" \| "dark" \| "system"`                           | `"system"` | Color scheme. `"system"` follows `prefers-color-scheme`.                                             |
| `editable`              | `boolean`                                                 | `true`     | `false` renders a read-only document.                                                                |
| `className`             | `string`                                                  | —          | Class names for the root element.                                                                    |
| `mobileToolbar`         | `boolean`                                                 | `true`     | Fixed bottom toolbar with block actions below 640 px. Leave about 4.5 rem of bottom padding for it. |
| `tools`                 | `ToolSelection`                                           | all        | Tools to offer: an array of names, or an object of `true` / per-tool options. See [Tools and plugins](#tools-and-plugins). |
| `toolbar`               | `ToolbarConfig \| false`                                  | `DEFAULT_TOOLBAR` | Formatting toolbar items and order, or `{ items?, placement?: "floating" \| "fixed" }`. `false` hides it. |
| `plugins`               | `GenesisPlugin[]`                                         | —          | Custom tools from `definePlugin`.                                                                    |
| `onConfigureUploads`    | `() => void`                                              | —          | Adds a "Configure uploads" link to the Upload tab while no destination is set.                       |

### `BlockEditorHandle` (ref)

| Member              | Description                                                         |
| ------------------- | ------------------------------------------------------------------- |
| `editor`            | The underlying `BlockNoteEditor`, for anything the props don't cover. |
| `focus()`           | Focuses the editor.                                                 |
| `getBlocks(options?)` | Returns the current document. `{ meta: "strip" }` leaves out `meta`. |
| `setBlocks(blocks)` | Replaces the document. Counts as an edit.                           |
| `getMarkdown()`     | Lossy Markdown export of the document.                              |
| `getHTML(options?)` | The document as HTML that `parseHTML` reads back losslessly. Options: `embeds`, `embedScripts`. |
| `setHTML(html)`     | Replaces the document with parsed HTML and returns the import report. |
| `lastReport`        | The report from the most recent HTML import, or `null`.             |
| `pendingUploads`    | File uploads and image re-uploads still running.                    |
| `uploadsSettled()`  | Resolves once nothing is uploading.                                 |
| `clearPersisted()`  | Removes the saved copy from `localStorage`.                          |

### Other exports

- `mapResponsePath(path)`: builds a `mapUploadResponse` from a dot path.
- `uploadWithConfig(config, file)` and `getUploadMode(config)`: the upload logic
  the editor uses, for reuse elsewhere.
- `loadStoredDocument(key)`, `clearStoredDocument(key)`, `DEFAULT_PERSIST_KEY`.
- `MAX_LOCAL_UPLOAD_BYTES`: the 2 MB limit for the `data:` URL fallback.
- `definePlugin(plugin)`, `ToolbarButton` (a toolbar button for plugins), and
  BlockNote's `createReactBlockSpec`.
- `BLOCK_TOOLS`, `INLINE_TOOLS`, `BUILT_IN_TOOLS`, `DEFAULT_TOOLBAR`.
- From `genesis-editor/parser` (no React): `parseHTML`, `parseHTMLAsync`,
  `toHTML`, `decodeEscapedHTML`, `defineEmbedProvider`, `BUILT_IN_EMBED_PROVIDERS`,
  `getEmbedFrameSrc`/`getEmbedScriptSrc` (CSP lists), `stripMeta`, colour and
  font-size helpers, `toDomAdapter`, `browserDom`, and the `DomOption`,
  `DomAdapter`, `DocumentFactory` and `DOMParserLike` types.
  `genesis-editor/parser/linkedom` exports `linkedomDom` (install `linkedom`)
  and `genesis-editor/parser/jsdom` exports `jsdomDom` (install `jsdom`).
- Types: `BlockEditorProps`, `BlockEditorHandle`, `UploadConfig`,
  `UploadErrorEvent`, `UploadMode`, `UploadResponseMapper`, `PersistOptions`,
  `PersistStatus`, `StoredDocument`, `EditorTheme`, `EditorContent`,
  `ToolSelection`, `ToolOptions`, `ToolbarConfig`, `ToolbarItemName`,
  `BuiltInToolName`, `BlockToolName`, `InlineToolName`, `BuiltInToolbarItem`,
  `HeadingLevel`, `GenesisPlugin`, `SlashMenuItem`, `MarkdownShortcut`,
  `ToolbarItem`, `ToolbarButtonProps`, `AnyEditor`, `AnyPartialBlock`, and BlockNote's `Block`,
  `PartialBlock`, `BlockNoteEditor`.

## Styling

`genesis-editor/style.css` contains everything the editor needs. Every rule is
scoped to `.genesis-editor` (the root element and BlockNote's menus), and it uses
no cascade layers, so it doesn't restyle the rest of your page and your page's
layered styles don't override the editor.

The editor uses your page's font. To theme it, set these variables on a class you
pass as `className` (or on `.genesis-editor` for every editor), and on
`.your-class[data-color-scheme="dark"]` for dark mode: `--background`,
`--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`,
`--muted-foreground`, `--accent`, `--accent-foreground`, `--popover`,
`--popover-foreground`, `--border`, `--input`, `--ring`, `--destructive`,
`--radius`. Set `--genesis-editor-font-family` to use a different font.
BlockNote's own `--bn-colors-*` variables also apply.

```css
.brand-editor {
  --primary: oklch(0.55 0.2 275);
  --radius: 1rem;
}
```

```tsx
<BlockEditor className="brand-editor" />
```

The editor reserves its own left gutter for the hover side menu (the **+** and
drag handle), so it never touches your container's edge and needs no padding
from the host. Set `--genesis-gutter` (default `3.75rem`; keep it at least
`3.25rem`) to change it, and `--genesis-gutter-end` for a different right
padding. Below 640px, with the mobile toolbar on, the side menu is hidden and
the gutter is `1.25rem`.

## Known limitations

HTML import and export:

- Round trips are exact for the editor's own HTML. Pasted HTML loses what the
  editor can't show: `<sub>`/`<sup>` become plain text; link `title`, `target`
  and `rel`, and `<picture>` sources aren't kept; a definition list becomes a
  bold term with its definition nested below; `dir="ltr"` is dropped (only `rtl`
  and `auto` are kept).
- `&nbsp;` becomes an ordinary space, and `&nbsp;` padding collapses (see
  [HTML](#html)). Trailing newlines in code blocks are trimmed.
- Hex colours within ΔE2000 3 of a palette colour or brand swatch snap to it.
- Captions and image `alt` text come from pasted or loaded HTML; there's no UI to
  edit them. Embeds have no resize handle (`previewWidth` is stored and exported).
- JSON-encoded HTML is decoded only in clear cases. The inside of a JSON string
  whose only escapes are newlines inside text, or that shows escapes inside code,
  is parsed as it is.
- Multi-line plain-text pastes use BlockNote's own handling, so a provider URL
  on one of their lines stays a link.

Packaging:

- The CommonJS build (`require("genesis-editor")`) bundles BlockNote and its
  other dependencies except React, because their CommonJS builds don't load on
  Node. The ES module build uses your installed copies. An app that loads the
  editor both ways gets two copies of BlockNote, so keep to one.
  `genesis-editor/parser/linkedom` bundles linkedom in its CommonJS build for
  the same reason.

Embeds:

- A site that refuses to be framed can't be detected across origins; the embed's
  "Open ↗" link stays the way out.
- Bluesky links with a handle (not a DID) stay links. Mastodon servers outside
  `MASTODON_SERVERS` become generic embeds, which the `allowlist` policy refuses.
  Flickr exports as its player iframe rather than its snippet. Twitch and
  Calendly aren't built in.
- The GitHub Gist widget runs in a `srcdoc` frame that inherits your CSP: allow
  `getEmbedScriptSrc()` and the inline height reporter.
- `tools`, `embeds` and `embedProviders` are read when the editor is created;
  changing `tools` rebuilds the editor, and the embed options need a remount.

Colours and uploads:

- The block colour menu offers the palette only; hex block colours come from
  pastes and loaded HTML. Brand swatches have one hex for both themes.
- `uploadUrl` and `uploadFromUrl` show an indeterminate spinner (no byte
  progress). Redoing an undone paste doesn't queue its images for re-hosting
  again.
- `uploadFromUrl` servers fetch URLs supplied by users: guard against SSRF there.

## License

MIT. The stylesheet includes styles from BlockNote (MPL-2.0) and Tailwind CSS (MIT).
