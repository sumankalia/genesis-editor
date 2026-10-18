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

### Uploads (breaking: `onUploadError` events now have a `kind`)

- **Re-hosting pasted and loaded images.** With an upload destination configured, images pasted from other sites or loaded through an HTML `value`, `setHTML`, `setBlocks` or initial content are copied to it in the background. Blocks appear immediately with the original image and a progress badge; the `url` swap sets `originalUrl` and isn't an undo step.
  - `uploadFromUrl` (JSON `POST` of `{ url, alt?, filename? }` → `{ url }`, fetched by your server) and `uploadRemote(url, ctx)`; without them the browser downloads the image (CORS permitting) and sends it through `uploadFile`/`uploadUrl`. `data:` and `blob:` images are sent as files.
  - `rehostImages: "auto" | "off" | (url) => boolean`; `"auto"` skips the page's origin, the upload endpoints' hosts, hosts earlier uploads returned and images that already have an `originalUrl`.
  - Up to `uploadConcurrency` (4) requests at once in document order, 30 s timeout each, one automatic retry for network errors, timeouts and 5xx. The same image (URL without `#hash`, or the SHA-256 of `data:` bytes) is uploaded once per editor. Requests are aborted when their block is deleted or the editor unmounts.
  - Failures keep the original URL and show "Not re-uploaded · Retry"; they're reported to `onUploadError` as `{ kind: "rehost", error, url, blockId, retry }` and counted in the import report's new `images.rehosted` / `images.rehostFailed`. File upload failures are `{ kind: "file", … }`.
  - `pendingUploads` and `uploadsSettled()` on the ref, covering file uploads too.
- `uploadHeaders` (object or async function) for `uploadUrl` and `uploadFromUrl`. `uploadFile` receives a second argument, `{ signal, onProgress, blockId, source }`. Upload requests throw `UploadError` with the HTTP `status`.
- Pasted `data:` images over 1 MB are left out of the paste, with a warning, when no upload destination is configured (`ParseOptions.maxDataImageBytes`). Loaded documents keep theirs.
- `parseHTMLAsync(html, { uploadRemote | uploadFromUrl, … })` in `genesis-editor/parser` copies images before returning.
- HTML export writes `originalUrl` as `data-original-src`, and import reads it back.

### HTML

- `format="html"` with `defaultValue`/`value`/`onChange(html, info)`, `htmlMode`, `baseUrl`, `onImportReport`, and `getHTML`/`setHTML`/`lastReport` on the ref.
- External HTML pastes go through `genesis-editor/parser` in both formats: one undo step, leading-paragraph merge, and split at the cursor.
- Page-furniture removal for pastes (`clean`, `CleanOptions`) with an "Undo cleanup" toast (`cleanupToast`); empty paragraphs collapsed in pastes.
- `genesis-editor/parser`: `parseHTML`, `toHTML`, and the `linkedom` adapter for servers.

### Fixed

- Pasting lists with the list tools off could leave a stray empty paragraph that a second clean removed.
