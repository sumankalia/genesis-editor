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
- Light, dark, and system themes; "Copy as Markdown" and "Reset document" in the
  header menu.

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

## Project layout

```
src/
  app/
    layout.tsx                 Theme, tooltip, and toast providers
    page.tsx                   Renders the editor
    globals.css                Tailwind + shadcn theme, editor tweaks
  components/
    editor/
      editor-loader.tsx        Client-only dynamic import (editor reads localStorage)
      block-editor.tsx         BlockNote setup, autosave, Mod+K link shortcut
      editor-header.tsx        Save status, document menu, theme switcher
      formatting-toolbar.tsx   Selection toolbar (adds inline code + mobile move buttons)
      mobile-block-toolbar.tsx Bottom block-actions bar on small screens
      link-dialog.tsx          URL prompt used by Mod+K and the mobile toolbar
    ui/                        shadcn/ui components
  lib/
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
- No file upload handler is configured, so image, video, audio, and file blocks
  only accept embedded URLs.
