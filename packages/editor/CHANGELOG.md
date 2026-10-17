# Changelog

All notable changes to `genesis-editor` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
