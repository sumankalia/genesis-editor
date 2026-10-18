# Changelog

All notable changes to `genesis-editor`. The package is not published yet; everything below ships in the first release.

## Unreleased

### Block JSON (breaking for documents saved by earlier builds)

- **Per-block `meta`.** Blocks can carry a top-level `meta` object (`GenesisMeta`, versioned with `v: 1`) holding the source element's `id`, `lang` and `dir`, a quote attribution's origin (`source.tag: "cite"`), import provenance and `ext` data for integrators and plugins. It's left out when empty. `onChange`, `getBlocks`, `value`/`initialContent` and `HtmlChangeInfo.blocks` use this public shape (`GenesisBlock`); inside the editor `meta` is a JSON string prop added to every block type, plugin blocks included.
  - Edit rules: a split copies `meta` to the second half without `attrs.id`; a merge keeps the first block's; an inserted `attrs.id` that collides with an earlier one is dropped.
  - HTML export writes only `id`, `lang` and `dir`. The clipboard's `text/html` for other apps never carries `data-meta`.
  - `meta={{ policy: "keep" | "strip-on-export" | "off", trackProvenance }}`: `strip-on-export` keeps meta in the document and localStorage but leaves it out of `onChange`, `getBlocks`, `getHTML` and the clipboard; `off` removes the prop from the schema.
  - `stripMeta(blocks)`, `migrateMeta(meta)` and `META_VERSION`, from both `genesis-editor` and `genesis-editor/parser`; `getBlocks({ meta: "strip" })`; `ParseOptions.trackProvenance`.
  - Meta from a newer version is kept untouched; meta without `v` is read as version 1.
- **Versioned localStorage.** `persist` now saves `{ v: 2, blocks, savedAt }` with public block JSON. Unversioned saves from earlier builds are migrated on load (`migrateStoredDocument`, `STORAGE_VERSION`); saves from a newer version are ignored rather than misread.
- **Quote.** New `cite` prop (the `<blockquote cite>` URL). Further paragraphs and the attribution are the quote's children, drawn inside the quote's border. `<cite>`, `<footer>`, a `<p>` holding only a `<cite>`, and a `<figure>`'s caption become the attribution paragraph, exported as `<cite>` inside `<blockquote>`.
- **Image.** New props `alt` (kept apart from `name`, the file name), `srcset`, `sizes`, intrinsic `width`/`height`, `captionRich` (the caption's inline content as JSON, exported while it still matches `caption`), `href` (a link around the image) and `originalUrl` (for re-hosting). The display width is now exported as `style="width:…px"` so it isn't read back as the intrinsic width. Replacing an image's file clears its `srcset`, `sizes` and intrinsic size.

### HTML

- `format="html"` with `defaultValue`/`value`/`onChange(html, info)`, `htmlMode`, `baseUrl`, `onImportReport`, and `getHTML`/`setHTML`/`lastReport` on the ref.
- External HTML pastes go through `genesis-editor/parser` in both formats: one undo step, leading-paragraph merge, and split at the cursor.
- Page-furniture removal for pastes (`clean`, `CleanOptions`) with an "Undo cleanup" toast (`cleanupToast`); empty paragraphs collapsed in pastes.
- `genesis-editor/parser`: `parseHTML`, `toHTML`, and the `linkedom` adapter for servers.

### Fixed

- Pasting lists with the list tools off could leave a stray empty paragraph that a second clean removed.
