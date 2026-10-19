# Changelog

All notable changes to `genesis-editor`.

## Unreleased

- **The editor and `genesis-editor/parser` share chunks** in the ESM build, so an app that imports both downloads the HTML engine once: about 37 KB (gzip) less (re-measured with esbuild against 0.1.0; Vite and Next.js are in the same range). Apps that import only one of them are unchanged within 1 KB, as are the API, the behaviour and the CommonJS build. Only the editor entry is marked `"use client"`.

## 0.1.0 (2026-10-19)

First release. Everything below is new in it; the "breaking" notes concern documents and handlers written against earlier unreleased builds. See the README's [Known limitations](README.md#known-limitations).

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
- New image prop `hosted`: set after a direct upload and on re-hosted copies, exported as `data-genesis-hosted` and read back, so a later load never copies the app's own images. A new URL clears it unless the same update sets it.
- `trustedHosts` (`"cdn.example.com"`, `"*.example.com"`, an origin, or a predicate): images on these hosts are never re-hosted, whatever `rehostImages` says. Also accepted by `parseHTMLAsync`.

### Colors

- **Breaking:** the colour tool and toolbar item are now `colors` (was `color`), with options: `tools={{ colors: { palette, custom, swatches } }}`.
- `textColor`/`backgroundColor` hold `"default"`, a palette name, a brand swatch name, or lowercase `#rrggbb` (backgrounds also `#rrggbbaa`). Palette colours follow the theme; hex and swatches are drawn inline and look the same in both. Anything else is drawn as the default.
- Hex colours now render in the editor: on text, on blocks and in table cells.
- New colour menu: Text and Background sections with Default, the palette, brand swatches, up to 8 **Document colors**, the last 8 custom colours (`localStorage`), and **Custom…** with a hex/CSS field, the native colour picker and an eyedropper where `EyeDropper` exists. Hex swatches show their value on hover.
- `colorContrast="auto"` adjusts hex text that has less than 3:1 contrast with the theme's background, at render time only.
- Paste: colours within ΔE2000 3 of a brand swatch snap to it, like palette colours. Translucent backgrounds keep their alpha as `#rrggbbaa`. `custom: false` sends other pasted hex to the palette colour for its hue (as strict mode does); `palette: false` stops snapping to the palette.
- Export writes swatch names as their hex plus `data-text-color`/`data-background-color`; pass `toHTML(blocks, { swatches })` and `parseHTML(html, { tools: { colors: { swatches } } })` on the server. `getHTML()` uses the editor's own.
- New exports: `editorColor`, `isStoredColor`, `contrastRatio`, `withContrast` (`genesis-editor/parser`), and the `ColorSwatch`/`ColorToolOptions` types.
- New dependencies: `prosemirror-view` and `prosemirror-model` (the copies BlockNote uses), for the block colour decorations.

### Font size

- New inline tool and toolbar item `fontSize`: a dropdown with Default, 6, 8, 10, 12, 14, 18 and 20 px, showing "—" for mixed sizes. `Mod+Shift+.` / `Mod+Shift+,` step up and down. Hidden in headings and code blocks, where sizes don't apply.
- Stored as the style `fontSize: "14px"`; 16 is the default and stores nothing.
- Paste: sizes in any unit are converted to px, then scaled so the source's body size (the most common size by text length) becomes 16, then clamped to 6–20 and snapped to a step (ties up). A Google Doc at 11 pt pastes as Default. `report.fontSizes` counts `sized` and `clamped` text.
- Export writes `<span style="font-size:14px" data-font-size="14px">`; `data-font-size` is read back exactly, without scaling, and lines with it are never promoted to headings.
- With `fontSize` off, pasted sizes are dropped and reported under `unsupportedStyles` as before.
- New exports from `genesis-editor/parser`: `FONT_SIZES`, `isFontSize`, `snapFontSize`.

### Embeds

- New `embed` block and tool (on by default): `provider`, `url`, `embedUrl`, `aspectRatio`, `height`, `title`, `caption`, `previewWidth`. Provider frames are rebuilt from `url` on every render and export; a stored `embedUrl` or `data-provider` is never trusted.
- 20 built-in providers (YouTube via `youtube-nocookie.com`, Vimeo, TikTok, Instagram, X, Spotify, Loom, CodePen, Figma, Google Maps, Dailymotion, SoundCloud, CodeSandbox, Google Docs/Slides/Sheets, Airtable, Typeform, Miro, Canva, Apple Music, Apple Podcasts). `defineEmbedProvider`, the `embedProviders` prop and plugin `embeds` add more; `BUILT_IN_EMBED_PROVIDERS` lists them.
- Pasted or loaded `<iframe>` code maps to its provider, else a generic embed: `https:` only, never the app's origin, `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`, no `allow`, `referrerpolicy="no-referrer"`, `credentialless`. Pasted `sandbox`/`allow`/`style`/`on*` are ignored.
- A provider URL alone on a pasted line (plain text or HTML) becomes an embed in its own undo step: one undo gives the link back. A URL inside a sentence stays a link. Each embed has a bar with the site, "Open ↗" and "Convert to link"; `/embed` takes a link or iframe code.
- `embeds={{ policy: "open" | "allowlist", providers, generic }}` (also a `ParseOptions` field). `allowlist` and `htmlMode="strict"` turn unknown iframes into links. `getEmbedFrameSrc()` returns the CSP `frame-src` list.
- Export writes `<figure data-genesis-embed …><iframe …></figure>`; `toHTML(blocks, { embeds: "link" })` writes link cards for email and RSS. Both read back to the same blocks. With the tool off, embeds become link paragraphs. `report.embeds` counts `provider`, `generic` and `blocked`.
- **Sites' embed code** (`<blockquote>` / `<div>` / `<a>` plus `<script>`) becomes an embed with or without its script, in HTML pastes, raw-code pastes (`text/plain`), `value`/`setHTML` and `/embed`. The pasted script is never run or kept. 13 more built-in providers (33 in all), each drawn in our own iframe template: Threads, Bluesky, Reddit, Facebook posts and videos, Pinterest, Tumblr, Mastodon (12 listed servers in `MASTODON_SERVERS`; others become generic embeds), LinkedIn, Imgur, Flickr, Giphy and Telegram. GitHub Gist, which is script-only, renders as a widget: the official script in a `srcdoc` frame with `WIDGET_SANDBOX` (no `allow-same-origin`), sized by height messages from that frame only. `getEmbedScriptSrc()` returns its CSP `script-src` origins.
- Embed blocks gain `fallback` (the embed code's text, shown until the frame loads and when the embed is blocked; paragraphs above the link with the tool off) and `snippet` (came from embed code).
- `toHTML` / `getHTML` `embeds: "auto"` is the new default: embeds from embed code export as the site's canonical snippet inside `<figure data-genesis-embed="snippet">`, rebuilt from the stored URL and text; others still export as iframes. `"iframe"` keeps the text in `data-fallback`; `"link"` writes it as a quote above the link. `embedScripts: true` appends each official script once. `getHTML(options?)` takes `embeds` and `embedScripts`.
- `defineEmbedProvider` takes a `snippet` matcher (`selector`, `url`, optional `frame`, `text`, `size`, `toHTML`, `script`), `render: "widget"` and `pastedSize`. `fromHTML` is deprecated but still works. New parser exports: `embedForSnippet`, `embedForMarkup`, `embedSnippetHTML`, `widgetDocument`, `snippetLines`.
- Slash menu: title-prefix matches come first within a group, so `/embed` picks Embed before File.
- New dependency: `prosemirror-history` (the same copy BlockNote uses), for the separate undo step.

### HTML

- `format="html"` with `defaultValue`/`value`/`onChange(html, info)`, `htmlMode`, `baseUrl`, `onImportReport`, and `getHTML`/`setHTML`/`lastReport` on the ref.
- External HTML pastes go through `genesis-editor/parser` in both formats: one undo step, leading-paragraph merge, and split at the cursor.
- Page-furniture removal for pastes (`clean`, `CleanOptions`) with an "Undo cleanup" toast (`cleanupToast`); empty paragraphs collapsed in pastes.
- `genesis-editor/parser`: `parseHTML`, `toHTML`, and the `linkedom` and `jsdom` adapters for servers.
- **JSON-encoded HTML is decoded** instead of showing `\n`, `\t` and `\"` as text and breaking attributes: a quoted JSON string, JSON holding HTML strings (`[{ "HTML": "…" }]`), or the inside of a JSON string when its escapes are structural (escaped attribute quotes, `<\/`, `\u003c`, or newlines only between tags and never inside code). Applies to `parseHTML`, `value`/`setHTML` and pastes, including JSON copied as plain text. The report gets a warning; `ParseOptions.decodeEscaped: false` turns it off. New export `decodeEscapedHTML`.
- **`&nbsp;` padding collapses.** An `&nbsp;` next to other whitespace, or at a line's start or end, collapses like a space, so `Land,&nbsp; some` and `seasons.&nbsp;&nbsp; &nbsp;</p>` no longer leave double or trailing spaces. A lone `&nbsp;` between words is still a space. `toHTML` writes intentional double and edge spaces as `<span style="white-space:pre-wrap">` instead of `&nbsp;`, so they still read back exactly.

### Node and server rendering

- **Node 18 and newer** (`engines: ">=18"`). Every entry point (`genesis-editor`, `/parser`, `/parser/linkedom`, `/parser/jsdom`) loads with both `import` and `require` on Node 18, 20 and 22.
  - The CommonJS build of the main entry bundles BlockNote and its other dependencies except React: their CommonJS builds require ESM-only packages (`lib0`) before Node 22.12 and fail to initialize after it. The ES module build still uses the installed copies.
  - The CommonJS build of `genesis-editor/parser/linkedom` bundles linkedom, whose own CommonJS build requires ESM-only `css-select`.
- **Pluggable DOM.** `ParseOptions.dom` takes an adapter (`{ parse(html) }`), a function returning a `Document`, or a `DOMParser` instance or class. Every form receives fragments wrapped in a full document. New exports `toDomAdapter` and the `DomOption`, `DocumentFactory` and `DOMParserLike` types.
- **`genesis-editor/parser/jsdom`** exports `jsdomDom`. `jsdom` is an optional peer dependency.
- **SSR-safe `BlockEditor`.** Rendering on the server no longer crashes: server rendering and hydration draw an empty `<div class="genesis-editor" data-genesis-pending>`, and the editor mounts on the client. `next/dynamic` with `ssr: false` is no longer needed.
- The `system` theme falls back to light where `matchMedia` is missing (jsdom), so the editor mounts in Jest and Vitest tests.
- `pnpm test:node` (`scripts/node-matrix.mjs`) installs the packed tarball on each Node version found and checks every entry point.

### Fixed

- Instagram embeds from an iframe or embed code store the bare post URL (`https://www.instagram.com/p/ID/`). The pasted `src`'s tracking query, which can include the embedding page's URL (`rd`, `rp`), was kept and exported.
- Pasting lists with the list tools off could leave a stray empty paragraph that a second clean removed.
