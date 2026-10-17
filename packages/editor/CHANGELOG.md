# Changelog

All notable changes to `genesis-editor` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `tools` prop: choose built-in block and inline tools by name, or with
  per-tool options (`heading: { levels }`). Disabled tools are left out of the
  slash menu, toolbars, Markdown shortcuts, and paste; existing content that
  uses them falls back to paragraphs.
- `toolbar` prop: choose and order formatting toolbar items, pin the toolbar
  above the content with `placement: "fixed"`, or hide it with `false`.
- `plugins` prop and `definePlugin` for custom blocks, slash menu items,
  toolbar items, Markdown shortcuts, and keyboard shortcuts. Built-in tools are
  plugins too.
- `ToolbarButton`, `createReactBlockSpec` (re-exported), `BLOCK_TOOLS`,
  `INLINE_TOOLS`, `BUILT_IN_TOOLS`, `DEFAULT_TOOLBAR`, and the related types,
  including `EditorContent` for content with plugin blocks.
- `--genesis-gutter` and `--genesis-gutter-end` CSS variables. The editor
  reserves its own gutter, so the side menu stays inside the editor in any
  container without host padding.

### Changed

- Smaller side menu: 14px icons in 22px buttons, muted until hovered, with a
  short fade-in.
- Below 640px, with the mobile toolbar on, the hover side menu is hidden.

## [0.1.0] - 2026-10-17

First release.

### Added

- `<BlockEditor>`: a block-based editor built on BlockNote 0.56 with a slash
  menu, drag handles, `Tab` / `Shift+Tab` nesting, a formatting toolbar with
  inline code, Markdown shortcuts, and a `Mod+K` link dialog.
- Content as `initialContent` or controlled `value` with `onChange`.
- Opt-in `localStorage` autosave via `persist`, with `onPersistStatusChange`.
- Image uploads by link, file picker, drop, or paste, sent to `uploadUrl`
  (multipart `POST`, optional `mapUploadResponse`) or a custom `uploadFile`
  function, with a `data:` URL fallback. Uploading, error, and retry states,
  and `onUploadError`.
- `theme` (`light`, `dark`, `system`), `editable`, `className`, and a mobile
  block toolbar (`mobileToolbar`).
- A ref handle with `editor`, `focus`, `getBlocks`, `setBlocks`,
  `getMarkdown`, and `clearPersisted`.
- `genesis-editor/style.css`: a precompiled stylesheet scoped to
  `.genesis-editor`, so host apps don't need Tailwind or shadcn/ui.
- ESM and CommonJS builds with TypeScript declarations.

[0.1.0]: https://github.com/sandeep-code/genesis/releases/tag/genesis-editor%400.1.0
