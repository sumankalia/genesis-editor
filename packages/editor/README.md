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
- Images by URL or upload (picker, drop, paste) to your server or your own function
- Light, dark, or system theme; read-only mode
- Optional autosave to `localStorage`
- A bottom block toolbar on small screens

## Install

```bash
npm install genesis-editor
# or: pnpm add genesis-editor / yarn add genesis-editor
```

Requires React 18 or 19. BlockNote is installed as a dependency.

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

The editor needs the DOM, so render it on the client only. The package is marked
`"use client"`; in the Next.js App Router, load it without SSR:

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
| `initialContent`        | `EditorContent`                                           | —          | Content for the first render. Ignored when `value` is set or a persisted document exists.            |
| `value`                 | `EditorContent`                                           | —          | Controlled content. A new value that differs from the document replaces it.                           |
| `onChange`              | `(blocks: Block[], editor: BlockNoteEditor) => void`      | —          | Called after every edit with the full document. Not called for changes made through `value`.         |
| `persist`               | `boolean \| { key?: string; debounceMs?: number }`        | `false`    | Autosave to `localStorage`. Default key `"genesis-editor:document"`, default delay 400 ms.          |
| `onPersistStatusChange` | `(status: PersistStatus) => void`                         | —          | Autosave progress: `idle`, `saving`, `saved` (with `savedAt`), or `error`.                          |
| `uploadUrl`             | `string`                                                  | —          | Endpoint for multipart `POST` uploads (field `file`, response `{ url }`).                           |
| `uploadFile`            | `(file: File) => Promise<string>`                         | —          | Custom upload function. Takes precedence over `uploadUrl`.                                           |
| `mapUploadResponse`     | `(body: unknown, response: Response) => string \| Promise<string>` | — | Reads the URL from an `uploadUrl` response.                                                       |
| `onUploadError`         | `(event: UploadErrorEvent) => void`                       | —          | Called when an upload fails, with `{ error, file, blockId, retry }`.                                |
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
| `getBlocks()`       | Returns the current document.                                       |
| `setBlocks(blocks)` | Replaces the document. Counts as an edit.                           |
| `getMarkdown()`     | Lossy Markdown export of the document.                              |
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

## License

MIT. The stylesheet includes styles from BlockNote (MPL-2.0) and Tailwind CSS (MIT).
