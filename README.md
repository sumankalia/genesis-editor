# Genesis

Genesis is a structured, block-based rich text editor in the style of Notion. A
document is not one flat WYSIWYG surface: every paragraph, heading, list item,
quote, code block, to-do, and divider is its own block that can be inserted,
converted, reordered, and nested independently.

It is built on [BlockNote](https://www.blocknotejs.org/) (which sits on
TipTap/ProseMirror), rendered with BlockNote's shadcn/ui skin inside a Next.js
App Router app.

## Features

- **Blocks**: paragraph, heading (H1–H6), bullet / numbered / to-do / toggle
  lists, quote, code block, divider, table, and media blocks.
- **Slash menu**: type `/` to insert a block or turn an empty block into another
  type; keep typing to filter.
- **Drag handles**: hover a block to reveal its handle, then drag to reorder.
  The handle's menu also deletes blocks and changes colors.
- **Nesting**: `Tab` indents a block under the one above it; `Shift+Tab` lifts it
  back out.
- **Inline formatting**: select text for the floating toolbar (block type, bold,
  italic, underline, strikethrough, inline code, color, nesting, link).
- **Markdown shortcuts** at the start of a line: `#`–`######` headings, `-`/`*`
  bullets, `1.` numbered lists, `[]` / `[x]` to-dos, `>` quotes, ```` ``` ````
  code blocks, `---` dividers, and `` `code` `` inline.
- **Autosave** to `localStorage` (key `genesis:document:v1`) shortly after every
  change, with a status indicator in the header. Pending changes are flushed when
  the tab is hidden or closed.
- **Mobile**: a bottom toolbar for adding, indenting, outdenting, and moving
  blocks (touch has no hover handle or Tab key). While the on-screen keyboard is
  open, BlockNote's formatting toolbar is pinned above it, with move up/down
  buttons added.
- **Images**: add one by link, or upload from your device with the file picker,
  by dropping a file on the panel or into the document, or by pasting. Uploaded
  images are stored as ordinary URL images. See [Image uploads](#image-uploads).
- Light, dark, and system themes; "Copy as Markdown", "Upload settings…", and
  "Reset document" in the header menu.

### Keyboard shortcuts

| Action                    | Shortcut                         |
| ------------------------- | -------------------------------- |
| Bold / italic / underline | `Mod+B` / `Mod+I` / `Mod+U`      |
| Strikethrough             | `Mod+Shift+S`                    |
| Inline code               | `Mod+E`                          |
| Link                      | `Mod+K`                          |
| Indent / outdent block    | `Tab` / `Shift+Tab`              |
| Heading 1–3               | `Mod+Alt+1` … `Mod+Alt+3`        |
| Paragraph                 | `Mod+Alt+0`                      |
| Bullet / numbered / to-do | `Mod+Shift+8` / `7` / `9`        |
| Undo / redo               | `Mod+Z` / `Mod+Shift+Z`          |

`Mod` is `⌘` on macOS and `Ctrl` elsewhere.

## Running locally

Requires Node.js 20.9+ and npm.

```bash
npm install
npm run dev -- --port 4317
```

Then open <http://localhost:4317>. Any port works; 4317 just avoids clashing
with other local servers.

Other scripts:

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint
```

## Image uploads

Clicking an empty image block opens a panel with two tabs:

- **Link**: paste an image URL. Nothing is uploaded.
- **Upload**: choose a file or drop one on the panel. Files dropped or pasted
  straight into the document create an image block and upload too.

Either way the block ends up with a URL in `props.url`, so an uploaded image
behaves exactly like a linked one: it resizes, takes a caption, autosaves, and
exports the same way.

While an upload runs, the block and the panel show an uploading state. If it
fails, the block goes back to "Add image", its panel opens with the error and a
**Retry** button that re-sends the same file, and a toast offers Retry too.

Where files go is set by props on the editor component. If more than one is
given, `uploadFile` wins, then `uploadUrl`, then the local fallback.

### `uploadUrl`: POST to a server

```tsx
import BlockEditor from "@/components/editor/block-editor";

<BlockEditor uploadUrl="https://api.example.com/uploads" />;
```

The editor sends `POST <uploadUrl>` with a `multipart/form-data` body that
holds the file in a field named `file`, and expects a 2xx JSON response like:

```json
{ "url": "https://cdn.example.com/images/abc123.png" }
```

A relative `url` is resolved against `uploadUrl`. A non-2xx status is shown as
the error, using the response's `error` field if there is one. Servers on
another origin must allow CORS from the editor's page.

If your server responds with a different shape, pass `mapUploadResponse`. It
gets the parsed body (JSON, or text if the body isn't JSON) and the `Response`,
and returns the URL:

```tsx
<BlockEditor
  uploadUrl="https://api.example.com/uploads"
  mapUploadResponse={(body) => (body as { data: { link: string } }).data.link}
/>
```

### `uploadFile`: your own upload logic

For signed URLs, SDKs, auth headers, or anything else, pass a function that
takes the `File` and resolves to its URL. Throw to show an error.

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

### No destination: browser-only fallback

With neither prop set, uploads are read into `data:` URLs and saved inside the
document in `localStorage`. This keeps the demo working without a server, but
files are limited to 2 MB and the document gets heavy quickly. The Upload tab
says so and links to the settings.

### Trying it in the demo

Open **⋯ → Upload settings…** to switch between:

- **This browser**: the data URL fallback (default).
- **Upload server**: enter an upload URL and, optionally, the JSON field holding
  the URL (for example `data.link`). "Use the built-in mock server" fills in
  `/api/mock-upload`.
- **Custom function**: an example `uploadFile` that runs its own request code.

Settings are saved in `localStorage`.

The mock server (`src/app/api/mock-upload`) is for local testing only. It
stores files in `.uploads/` (git-ignored), serves them from
`/api/mock-upload/<id>`, accepts raster images up to 10 MB, and supports these
query parameters:

| Parameter      | Effect                                          |
| -------------- | ----------------------------------------------- |
| `fail=1`       | Responds `500` so you can see the error state   |
| `delay=<ms>`   | Waits before responding (max 10 s)              |
| `shape=nested` | Responds `{ "data": { "link": "…" } }` instead  |

## Project layout

```
src/
  app/
    layout.tsx                 Theme, tooltip, and toast providers
    page.tsx                   Renders the demo
    globals.css                Tailwind + shadcn theme, editor tweaks
    api/mock-upload/           Local mock upload server (POST) and file route (GET)
  components/
    demo/
      demo-app.tsx             Demo shell: wires upload settings into the editor
      upload-settings-dialog.tsx
    editor/
      editor-loader.tsx        Client-only dynamic import (editor reads localStorage)
      block-editor.tsx         BlockNote setup, uploads, autosave, Mod+K link shortcut
      editor-header.tsx        Save status, document menu, theme switcher
      file-panel.tsx           Upload / Link tabs for image and file blocks
      upload-tab.tsx           File picker, drop zone, uploading/error/retry states
      upload-context.tsx       Upload actions shared with the file panel
      formatting-toolbar.tsx   Selection toolbar (adds inline code + mobile move buttons)
      mobile-block-toolbar.tsx Bottom block-actions bar on small screens
      link-dialog.tsx          URL prompt used by Mod+K and the mobile toolbar
    ui/                        shadcn/ui components
  lib/
    uploads.ts                 uploadFile / uploadUrl / data URL upload logic
    upload-status.ts           Per-block upload state (for retry)
    upload-settings.ts         Demo upload settings in localStorage
    storage.ts                 localStorage load/save
    starter-document.ts        Content shown on first visit and after reset
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · BlockNote 0.56.

## Limitations

- One document per browser. There is no document list, backend, or sync yet.
- `localStorage` is per-origin and limited to a few MB; if a save fails the
  header shows "Couldn't save".
- Video, audio, and file blocks use the same Upload tab and destination, but the
  mock server only accepts images.
- An upload that fails is kept in memory for Retry until the page reloads.
