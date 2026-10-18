import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
} from "react";
import { filterSuggestionItems, type Block, type BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { FilePanelExtension, SuggestionMenu } from "@blocknote/core/extensions";
import {
  BlockNoteViewEditor,
  FilePanelController,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";

import { CleanupToast } from "./components/cleanup-toast";
import { GenesisFilePanel } from "./components/file-panel";
import {
  createPasteHandler,
  importHTML,
  pasteWithoutCleanup,
  type HtmlImport,
  type HtmlImportOptions,
} from "./html";
import { metaFromProps, stripMeta, type GenesisMeta, type MetaOptions } from "./parser/meta";
import { toHTML } from "./parser/serialize";
import type { CleanOptions, CleanupSummary, FidelityReport, HtmlBlock, ParseMode } from "./parser/types";
import { GenesisFormattingToolbar, ToolbarItemsContext } from "./components/formatting-toolbar";
import { LinkDialog } from "./components/link-dialog";
import { MobileBlockToolbar } from "./components/mobile-block-toolbar";
import { UploadContext, type UploadContextValue } from "./components/upload-context";
import { cn } from "./lib/cn";
import {
  clearStoredDocument,
  loadStoredDocument,
  resolvePersistOptions,
  saveStoredDocument,
  type PersistOptions,
  type PersistStatus,
} from "./lib/persistence";
import { MAX_INLINE_DATA_IMAGE_BYTES, RehostQueue, fileNameFromUrl } from "./lib/rehost";
import { UploadStatusStore } from "./lib/upload-status";
import { getUploadMode, uploadWithConfig, type RehostSource, type UploadConfig } from "./lib/uploads";
import { useColorScheme, type EditorTheme } from "./lib/use-color-scheme";
import { acceptsFile } from "./plugins/files";
import { REHOST_META, registerRehostQueue } from "./plugins/specs";
import {
  mergeSlashItems,
  resolveEditorSetup,
  resolveToolbar,
  setupSignature,
  type ToolSelection,
  type ToolbarConfig,
} from "./plugins/resolve";
import { schemaSupport, toEditorBlocks } from "./plugins/sanitize";
import type { AnyEditor, AnyPartialBlock, GenesisPlugin } from "./plugins/types";

/** A block as `onChange` and `getBlocks` return it: BlockNote's block plus a top-level `meta` when it has any. */
export type GenesisBlock = Block & { meta?: GenesisMeta };

/** Blocks to load. Plugin block types are accepted alongside the built-in ones. */
export type EditorContent = ((PartialBlock | AnyPartialBlock) & { meta?: GenesisMeta })[];

export type UploadErrorEvent =
  | {
      /** A file the user picked, pasted or dropped. */
      kind: "file";
      error: Error;
      file: File;
      /** The image block the file was meant for. */
      blockId: string;
      /** Uploads the same file to the same block again. */
      retry: () => Promise<void>;
    }
  | {
      /** A pasted or loaded image that couldn't be copied to your storage. It keeps its original URL. */
      kind: "rehost";
      error: Error;
      /** The image's original URL. */
      url: string;
      blockId: string;
      /** Tries the re-upload again. */
      retry: () => Promise<void>;
    };

export type HtmlChangeInfo = {
  /** The document the HTML was serialized from. */
  blocks: GenesisBlock[];
  /** The report from the most recent HTML import (initial value, `setHTML`, or paste), if any. */
  report: FidelityReport | null;
  editor: BlockNoteEditor;
};

export type BlocksFormatProps = {
  /** Shape of `value`, `initialContent`, and `onChange`. Defaults to `"blocks"`. */
  format?: "blocks";
  /** Content for the first render (uncontrolled). Ignored when `value` is set or a persisted document is found. */
  initialContent?: EditorContent;
  /** Controlled content. When it changes to something other than the current document, the editor content is replaced. */
  value?: EditorContent;
  /** Called after every user edit with the full document. */
  onChange?: (blocks: GenesisBlock[], editor: BlockNoteEditor) => void;
  defaultValue?: never;
};

export type HtmlFormatProps = {
  /** `value`, `defaultValue`, and `onChange` carry HTML strings, parsed and serialized by `genesis-editor/parser`. */
  format: "html";
  /** HTML for the first render (uncontrolled). Ignored when `value` is set or a persisted document is found. */
  defaultValue?: string;
  /** Controlled HTML. Parsed only when it differs from the HTML the editor last emitted, so echoing it back is free. */
  value?: string;
  /** Called with the serialized document, at most every 150 ms while typing. */
  onChange?: (html: string, info: HtmlChangeInfo) => void;
  initialContent?: never;
};

export type BlockEditorProps = UploadConfig &
  (BlocksFormatProps | HtmlFormatProps) & {
  /** How pasted and loaded HTML is cleaned: `"strict"` also snaps custom colors to the palette and drops what the editor can't show exactly. Defaults to `"clean"`. */
  htmlMode?: ParseMode;
  /** Resolves relative links and image sources in pasted and loaded HTML. */
  baseUrl?: string;
  /** Page-furniture removal for pasted and loaded HTML: `{ noise: false }` turns it off; `keepSelectors`/`dropSelectors` tune it. */
  clean?: CleanOptions;
  /** After a paste that removed page furniture, show "Removed N sections · Undo cleanup". Defaults to `true`. */
  cleanupToast?: boolean;
  /**
   * Per-block metadata kept from imports (`id`/`lang`/`dir`, quote attributions…). `policy: "off"` leaves
   * it out of the schema; changing between `"off"` and the other policies mounts a new editor.
   */
  meta?: MetaOptions;
  /** Called after HTML is imported: the initial HTML `value`, `setHTML`, or a paste from outside the editor. */
  onImportReport?: (report: FidelityReport) => void;
  /** Opt-in autosave to localStorage. `true` uses the default key; pass `{ key }` for one key per document. */
  persist?: boolean | PersistOptions;
  /** Reports autosave progress, for a "Saving…/Saved" indicator. Only called when `persist` is on. */
  onPersistStatusChange?: (status: PersistStatus) => void;
  /** Called when an upload fails. The image block also shows the error with a Retry button. */
  onUploadError?: (event: UploadErrorEvent) => void;
  /** Color scheme. `"system"` follows `prefers-color-scheme`. Defaults to `"system"`. */
  theme?: EditorTheme;
  /** Set to `false` for a read-only view. Defaults to `true`. */
  editable?: boolean;
  /** Extra class names for the editor's root element. */
  className?: string;
  /** Show the fixed bottom toolbar with block actions on small screens. Defaults to `true`. */
  mobileToolbar?: boolean;
  /** When set, the upload panel shows a "Configure uploads" link while no upload destination is configured. */
  onConfigureUploads?: () => void;
  /**
   * Which tools to offer: `["heading", "image"]`, or `{ heading: { levels: [1, 2] }, bold: true }`.
   * Disabled tools are left out of every menu, shortcut, and toolbar, and pasted content falls back
   * to paragraphs. Paragraphs are always on. Defaults to every built-in tool and every plugin.
   */
  tools?: ToolSelection;
  /**
   * Formatting toolbar items in order, or `{ items, placement: "fixed" }` to pin the toolbar above
   * the editor. `false` turns it off. Defaults to the built-in items followed by plugin items.
   */
  toolbar?: ToolbarConfig | false;
  /** Plugins from `definePlugin`, adding blocks, menu items, toolbar items, and shortcuts. */
  plugins?: readonly GenesisPlugin[];
};

export type BlockEditorHandle = {
  /** The underlying BlockNote editor, for anything the props don't cover. */
  editor: BlockNoteEditor;
  /** Moves focus into the editor. */
  focus: () => void;
  /** The current document. `{ meta: "strip" }` leaves out `meta`, like `stripMeta`. */
  getBlocks: (options?: { meta?: "keep" | "strip" }) => GenesisBlock[];
  /** Replaces the whole document. Counts as an edit for `onChange` and persistence. */
  setBlocks: (blocks: EditorContent) => void;
  /** Lossy Markdown export of the current document. */
  getMarkdown: () => string;
  /** The current document as HTML, in the format `genesis-editor/parser` reads back losslessly. */
  getHTML: () => string;
  /** Replaces the whole document with parsed HTML and returns the import report. Counts as an edit. */
  setHTML: (html: string) => FidelityReport;
  /** The report from the most recent HTML import, or `null` if nothing was imported yet. */
  readonly lastReport: FidelityReport | null;
  /** Removes the persisted copy from localStorage and cancels any pending save. */
  clearPersisted: () => void;
  /** File uploads and image re-uploads still running. */
  readonly pendingUploads: number;
  /** Resolves once nothing is uploading, so a save can wait for final image URLs. Failed re-uploads count as settled. */
  uploadsSettled: () => Promise<void>;
};

/**
 * Empty file blocks swap in a "Loading..." placeholder when an upload starts and
 * only re-render when their props change, which normally happens when the URL
 * arrives. After a failed upload nothing changes, so nudge the `name` prop to
 * bring back the "Add image" button. No-op changes are skipped, hence two steps.
 */
function rerenderEmptyFileBlock(editor: BlockNoteEditor, blockId: string, name: string) {
  const setName = (value: string) =>
    editor.transact((tr) => {
      tr.setMeta("addToHistory", false);
      editor.updateBlock(blockId, { props: { name: value } });
    });
  const block = editor.getBlock(blockId);
  if (!block || !("url" in block.props) || block.props.url) return;
  if (block.props.name === name) setName("");
  setName(name);
}

/**
 * A whole document (`value`, `defaultValue`, `setHTML`) keeps its blank lines and its inline images;
 * pastes collapse blank lines and drop large inline images when there's nowhere to upload them.
 */
function documentOptions(options: HtmlImportOptions): HtmlImportOptions {
  return { ...options, maxDataImageBytes: undefined, clean: { ...options.clean, emptyParagraphs: "keep" } };
}

const describeUrl = (url: string) => (/^(data|blob):/i.test(url) ? "an inline image" : url);

function nonEmpty(blocks: EditorContent | undefined) {
  return blocks && blocks.length > 0 ? blocks : undefined;
}

/**
 * The schema is fixed when a BlockNote editor is created, so a change to `tools` or to the plugin
 * names mounts a new editor, which starts from the latest document.
 */
export const BlockEditor = forwardRef<BlockEditorHandle, BlockEditorProps>(function BlockEditor(props, ref) {
  const latestDocument = useRef<AnyPartialBlock[] | null>(null);
  return (
    <EditorInstance
      key={setupSignature(props.tools, props.plugins, props.meta?.policy !== "off")}
      {...props}
      latestDocument={latestDocument}
      ref={ref}
    />
  );
});

type EditorInstanceProps = BlockEditorProps & {
  latestDocument: MutableRefObject<AnyPartialBlock[] | null>;
};

const EditorInstance = forwardRef<BlockEditorHandle, EditorInstanceProps>(function EditorInstance(
  {
    format,
    initialContent,
    defaultValue,
    value,
    onChange,
    htmlMode = "clean",
    baseUrl,
    clean,
    cleanupToast = true,
    onImportReport,
    persist,
    onPersistStatusChange,
    uploadFile,
    uploadUrl,
    mapUploadResponse,
    uploadFromUrl,
    uploadRemote,
    uploadHeaders,
    rehostImages,
    trustedHosts,
    uploadConcurrency,
    onUploadError,
    theme = "system",
    editable = true,
    className,
    mobileToolbar = true,
    onConfigureUploads,
    tools,
    toolbar,
    plugins,
    meta,
    latestDocument,
  },
  ref,
) {
  const persistOptions = resolvePersistOptions(persist);
  const persistKey = persistOptions?.key ?? null;
  const debounceMs = persistOptions?.debounceMs ?? 0;
  // Tools, content, and persistence key are read once: changing them later needs a new editor.
  const metaPolicy = meta?.policy ?? "keep";
  const trackProvenance = meta?.trackProvenance;
  const [setup] = useState(() => resolveEditorSetup(tools, plugins, metaPolicy !== "off"));
  const [support] = useState(() => schemaSupport(setup.schema));
  const isHtml = format === "html";
  const htmlValue = isHtml && typeof value === "string" ? value : undefined;
  const blocksValue = isHtml ? undefined : (value as EditorContent | undefined);
  const sanitize = useCallback(
    (blocks: EditorContent) => toEditorBlocks(blocks, support) as PartialBlock[],
    [support],
  );
  const [initial] = useState(() => {
    const stored = persistKey ? loadStoredDocument(persistKey) : null;
    let imported: HtmlImport | null = null;
    const parse = (html: string | undefined) => {
      if (!html?.trim()) return undefined;
      imported = importHTML(html, documentOptions({ mode: htmlMode, tools, baseUrl, clean, trackProvenance }), sanitize);
      return nonEmpty(imported.blocks);
    };
    const content =
      (isHtml ? parse(htmlValue) : nonEmpty(blocksValue)) ??
      nonEmpty(latestDocument.current ?? undefined) ??
      stored?.blocks ??
      (isHtml ? parse(defaultValue) : nonEmpty(initialContent));
    const sanitized = content ? sanitize(content) : undefined;
    return {
      key: persistKey,
      stored,
      content: sanitized?.length ? sanitized : undefined,
      report: (imported as HtmlImport | null)?.report ?? null,
    };
  });

  const callbacks = useRef({ onChange, onPersistStatusChange, onUploadError, onImportReport, cleanupToast });
  // BlockNote captures `uploadFile` once at creation, so it reads the latest config through a ref.
  const uploadConfig = useRef<UploadConfig>({});
  const uploadMode = getUploadMode({ uploadFile, uploadUrl });
  const pasteImageLimit = uploadMode === "local" ? MAX_INLINE_DATA_IMAGE_BYTES : undefined;
  const htmlOptions = useRef<HtmlImportOptions>({ mode: htmlMode, tools, baseUrl, clean, trackProvenance, maxDataImageBytes: pasteImageLimit });
  const editableRef = useRef(editable);
  useLayoutEffect(() => {
    callbacks.current = { onChange, onPersistStatusChange, onUploadError, onImportReport, cleanupToast };
    uploadConfig.current = { uploadFile, uploadUrl, mapUploadResponse, uploadFromUrl, uploadRemote, uploadHeaders, rehostImages, trustedHosts, uploadConcurrency };
    htmlOptions.current = { mode: htmlMode, tools, baseUrl, clean, trackProvenance, maxDataImageBytes: pasteImageLimit };
    editableRef.current = editable;
  });

  const lastReport = useRef<FidelityReport | null>(initial.report);
  const [cleanup, setCleanup] = useState<{ summary: CleanupSummary; html: string } | null>(null);
  const recordImport = useRef((result: HtmlImport, pastedHtml?: string) => {
    lastReport.current = result.report;
    callbacks.current.onImportReport?.(result.report);
    const { cleanup: summary } = result.report;
    setCleanup(pastedHtml && summary.sections > 0 && callbacks.current.cleanupToast ? { summary, html: pastedHtml } : null);
  });
  useEffect(() => {
    if (initial.report) callbacks.current.onImportReport?.(initial.report);
  }, [initial.report]);

  const [uploadStatuses] = useState(() => new UploadStatusStore());
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const retryRef = useRef<(blockId: string) => Promise<void>>(async () => {});

  // Re-hosting swaps the URL outside the undo history, so undo never brings back the remote image.
  const [rehost] = useState(
    () =>
      new RehostQueue(
        () => uploadConfig.current,
        {
          onDone: (job, url) => {
            const current = editorRef.current;
            const block = current?.getBlock(job.blockId);
            if (!current || (block?.props as { url?: string } | undefined)?.url !== job.url) return;
            const props = /^https?:/i.test(job.url) ? { url, originalUrl: job.url, hosted: true } : { url, hosted: true };
            current.transact((tr) => {
              tr.setMeta("addToHistory", false);
              tr.setMeta(REHOST_META, true);
              current.updateBlock(job.blockId, { props } as never);
            });
            if (job.report) job.report.images.rehosted++;
          },
          onFail: (job, error) => {
            if (job.report) {
              job.report.images.rehostFailed++;
              job.report.warnings.push(`Couldn't re-upload ${describeUrl(job.url)}: ${error.message}`);
            }
            callbacks.current.onUploadError?.({
              kind: "rehost",
              error,
              url: job.url,
              blockId: job.blockId,
              retry: () => {
                rehost.retry(job.blockId);
                return rehost.settled();
              },
            });
          },
        },
        { origin: typeof window !== "undefined" ? window.location.origin : undefined },
      ),
  );
  /** Queues the images in `blocks` (and their children) that `rehostImages` calls for. Read-only views leave them be. */
  const [scheduleRehost] = useState(() => (blocks: Block[], source: RehostSource, report: FidelityReport | null) => {
    if (!editableRef.current) return;
    const visit = (list: Block[]) => {
      for (const block of list) {
        const props = block.props as { url?: string; originalUrl?: string; hosted?: boolean; alt?: string; name?: string };
        if (block.type === "image" && props.url && !props.originalUrl && !props.hosted && rehost.shouldRehost(props.url)) {
          rehost.enqueue({ blockId: block.id, url: props.url, alt: props.alt || props.name || undefined, filename: fileNameFromUrl(props.url), source, report });
        }
        visit(block.children as Block[]);
      }
    };
    visit(blocks);
  });

  const editor = useCreateBlockNote({
    schema: setup.schema,
    extensions: setup.extensions,
    initialContent: initial.content as never,
    pasteHandler: createPasteHandler(
      () => htmlOptions.current,
      sanitize,
      (result, html, inserted) => {
        recordImport.current(result, html);
        scheduleRehost(inserted, "paste", result.report);
      },
    ),
    // Never rejects: paste/drop uploads would surface as unhandled rejections, so
    // failures are recorded per block and shown in that block's file panel instead.
    uploadFile: (file, blockId) => rehost.track(upload(file, blockId)),
  }) as unknown as BlockNoteEditor;
  registerRehostQueue(editor, rehost);
  const colorScheme = useColorScheme(theme);

  function markHosted(blockId: string, url: string) {
    const current = editorRef.current;
    const block = current?.getBlock(blockId);
    if (!current || block?.type !== "image" || (block.props as { url?: string }).url !== url) return;
    current.transact((tr) => {
      tr.setMeta("addToHistory", false);
      current.updateBlock(blockId, { props: { hosted: true } } as never);
    });
  }

  async function upload(file: File, blockId: string | undefined) {
    if (blockId) uploadStatuses.set(blockId, { state: "uploading", file });
    try {
      const url = await uploadWithConfig(uploadConfig.current, file, {
        signal: new AbortController().signal,
        onProgress: () => {},
        blockId,
        source: "upload",
      });
      rehost.rememberHost(url);
      if (blockId) {
        uploadStatuses.delete(blockId);
        // BlockNote sets the URL once this resolves; then the image is marked as already on our storage.
        setTimeout(() => markHosted(blockId, url), 0);
      }
      return url;
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("Upload failed.");
      if (!blockId) throw error;
      uploadStatuses.set(blockId, { state: "error", file, message: error.message });
      const current = editorRef.current;
      if (current?.getBlock(blockId)) {
        rerenderEmptyFileBlock(current, blockId, file.name);
        current.getExtension(FilePanelExtension)?.showMenu(blockId);
      }
      callbacks.current.onUploadError?.({
        kind: "file",
        error,
        file,
        blockId,
        retry: () => retryRef.current(blockId),
      });
      return {};
    }
  }

  /** The document in public JSON, with `meta` as kept in the document. */
  const documentBlocks = useCallback(() => metaFromProps(editor.document) as GenesisBlock[], [editor]);
  /** The document as it leaves the editor: `strip-on-export` drops `meta`. */
  const exportedBlocks = useCallback(
    () => (metaPolicy === "keep" ? documentBlocks() : stripMeta(documentBlocks())),
    [documentBlocks, metaPolicy],
  );
  const exportedHtml = useCallback(() => toHTML(exportedBlocks() as unknown as HtmlBlock[]), [exportedBlocks]);

  const uploadToBlock = useCallback(
    async (file: File, blockId: string) => {
      const result = await editor.uploadFile?.(file, blockId);
      if (typeof result !== "string" || !editor.getBlock(blockId)) return;
      editor.updateBlock(blockId, { props: { name: file.name, url: result } });
      editor.getExtension(FilePanelExtension)?.closeMenu();
    },
    [editor],
  );

  const retryUpload = useCallback(
    async (blockId: string) => {
      const status = uploadStatuses.get(blockId);
      if (status) await uploadToBlock(status.file, blockId);
    },
    [uploadStatuses, uploadToBlock],
  );

  useEffect(() => {
    editorRef.current = editor;
    retryRef.current = retryUpload;
  }, [editor, retryUpload]);

  useEffect(() => {
    rehost.start();
    scheduleRehost(editor.document, "value", initial.report);
    return () => rehost.destroy();
  }, [editor, rehost, scheduleRehost, initial.report]);

  const uploadContext = useMemo<UploadContextValue>(
    () => ({
      mode: getUploadMode({ uploadFile, uploadUrl }),
      statuses: uploadStatuses,
      uploadToBlock,
      retryUpload,
      onConfigureUploads,
    }),
    [uploadFile, uploadUrl, uploadStatuses, uploadToBlock, retryUpload, onConfigureUploads],
  );

  // Persistence
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!initial.key) return;
    try {
      const savedAt = saveStoredDocument(initial.key, documentBlocks());
      callbacks.current.onPersistStatusChange?.({ status: "saved", savedAt });
    } catch (error) {
      callbacks.current.onPersistStatusChange?.({ status: "error", error });
    }
  }, [documentBlocks, initial.key]);

  const scheduleSave = useCallback(() => {
    if (!initial.key) return;
    callbacks.current.onPersistStatusChange?.({ status: "saving" });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, debounceMs);
  }, [flushSave, initial.key, debounceMs]);

  useEffect(() => {
    if (!initial.key) return;
    callbacks.current.onPersistStatusChange?.(
      initial.stored ? { status: "saved", savedAt: initial.stored.savedAt } : { status: "idle" },
    );
    const flushIfPending = () => {
      if (saveTimer.current) flushSave();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushIfPending();
    };
    window.addEventListener("beforeunload", flushIfPending);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushIfPending);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushIfPending();
    };
  }, [flushSave, initial]);

  // Controlled value
  const lastEmitted = useRef<GenesisBlock[] | null>(null);
  const lastValueJson = useRef<string | null>(blocksValue ? JSON.stringify(blocksValue) : null);
  const applyingValue = useRef(false);

  useEffect(() => {
    if (!blocksValue) return;
    if (blocksValue === lastEmitted.current) {
      lastValueJson.current = null;
      return;
    }
    const json = JSON.stringify(blocksValue);
    if (json === lastValueJson.current) return;
    lastValueJson.current = json;
    if (json === JSON.stringify(exportedBlocks())) return;
    applyingValue.current = true;
    try {
      editor.replaceBlocks(editor.document, sanitize(blocksValue));
    } finally {
      applyingValue.current = false;
    }
    scheduleRehost(editor.document, "value", null);
  }, [editor, blocksValue, sanitize, exportedBlocks, scheduleRehost]);

  // HTML value: the last HTML received or emitted. Anything else is parsed and replaces the document.
  const lastHtml = useRef<string | null>(htmlValue ?? null);
  const htmlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitHtml = useCallback(() => {
    if (htmlTimer.current) clearTimeout(htmlTimer.current);
    htmlTimer.current = null;
    const blocks = exportedBlocks();
    const html = toHTML(blocks as unknown as HtmlBlock[]);
    lastHtml.current = html;
    const emit = callbacks.current.onChange as HtmlFormatProps["onChange"];
    emit?.(html, { blocks, report: lastReport.current, editor });
  }, [editor, exportedBlocks]);

  const applyHtml = useCallback(
    (html: string, asEdit: boolean) => {
      const result = importHTML(html, documentOptions(htmlOptions.current), sanitize);
      applyingValue.current = !asEdit;
      try {
        editor.replaceBlocks(editor.document, result.blocks.length ? result.blocks : [{ type: "paragraph" }]);
      } finally {
        applyingValue.current = false;
      }
      recordImport.current(result);
      scheduleRehost(editor.document, "value", result.report);
      return result.report;
    },
    [editor, sanitize, scheduleRehost],
  );

  useEffect(() => {
    if (htmlValue === undefined || htmlValue === lastHtml.current) return;
    lastHtml.current = htmlValue;
    if (htmlTimer.current) clearTimeout(htmlTimer.current);
    htmlTimer.current = null;
    applyHtml(htmlValue, false);
  }, [htmlValue, applyHtml]);

  useEffect(
    () => () => {
      if (htmlTimer.current) emitHtml();
    },
    [emitHtml],
  );

  const handleChange = useCallback(() => {
    rehost.prune((job) => (editor.getBlock(job.blockId)?.props as { url?: string } | undefined)?.url === job.url);
    setCleanup(null);
    scheduleSave();
    if (applyingValue.current) return;
    latestDocument.current = documentBlocks() as AnyPartialBlock[];
    if (isHtml) {
      if (htmlTimer.current) clearTimeout(htmlTimer.current);
      htmlTimer.current = setTimeout(emitHtml, 150);
      return;
    }
    const blocks = exportedBlocks();
    lastEmitted.current = blocks;
    const emit = callbacks.current.onChange as BlocksFormatProps["onChange"];
    emit?.(blocks, editor);
  }, [editor, rehost, scheduleSave, latestDocument, isHtml, emitHtml, documentBlocks, exportedBlocks]);

  useImperativeHandle(
    ref,
    () => ({
      editor,
      focus: () => editor.focus(),
      getBlocks: (options) => (options?.meta === "strip" ? stripMeta(exportedBlocks()) : exportedBlocks()),
      setBlocks: (blocks) => {
        editor.replaceBlocks(editor.document, sanitize(blocks));
        scheduleRehost(editor.document, "value", null);
      },
      getMarkdown: () => editor.blocksToMarkdownLossy(editor.document),
      getHTML: exportedHtml,
      setHTML: (html) => applyHtml(html, true),
      get lastReport() {
        return lastReport.current;
      },
      clearPersisted: () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (initial.key) clearStoredDocument(initial.key);
      },
      get pendingUploads() {
        return rehost.pending;
      },
      uploadsSettled: () => rehost.settled(),
    }),
    [editor, initial.key, sanitize, applyHtml, exportedBlocks, exportedHtml, rehost, scheduleRehost],
  );

  // Links
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkInitialUrl, setLinkInitialUrl] = useState("");

  const openLinkDialog = useCallback(() => {
    setLinkInitialUrl(editor.getSelectedLinkUrl() ?? "");
    setLinkDialogOpen(true);
  }, [editor]);

  const closeLinkDialog = useCallback(() => {
    setLinkDialogOpen(false);
    editor.focus();
  }, [editor]);

  const applyLink = useCallback(
    (url: string) => {
      closeLinkDialog();
      if (editor.getSelectedText()) {
        editor.createLink(url);
      } else {
        editor.createLink(url, url);
      }
    },
    [editor, closeLinkDialog],
  );

  const linksEnabled = support.links;

  // BlockNote has no link shortcut; its toolbar link button needs a selection.
  const handleKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!editable || !linksEnabled || !mod || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.target instanceof Element) || !event.target.closest(".bn-editor")) return;
      event.preventDefault();
      event.stopPropagation();
      openLinkDialog();
    },
    [editable, linksEnabled, openLinkDialog],
  );

  // Without a block type for a file, BlockNote would insert a "file" block the schema lacks.
  const blockUnsupportedFiles = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement> | ReactDragEvent<HTMLDivElement>) => {
      const data = "clipboardData" in event ? event.clipboardData : event.dataTransfer;
      if (!data || !data.types.includes("Files") || data.types.some((type) => type !== "Files")) return;
      const files = Array.from(data.files);
      if (files.length && files.every((file) => acceptsFile(editor as AnyEditor, file))) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [editor],
  );

  // BlockNote writes `data-meta` into the clipboard. Other apps get none; with `strip-on-export`,
  // neither does BlockNote's own format.
  const stripClipboardMeta = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      const data = event.clipboardData;
      if (!data || metaPolicy === "off") return;
      const formats = metaPolicy === "strip-on-export" ? ["text/html", "blocknote/html"] : ["text/html"];
      for (const format of formats) {
        const html = data.getData(format);
        if (html.includes("data-meta=")) data.setData(format, html.replace(/\sdata-meta="[^"]*"/g, ""));
      }
    },
    [metaPolicy],
  );

  const getSlashItems = useCallback(
    async (query: string) =>
      filterSuggestionItems(
        mergeSlashItems(editor as AnyEditor, getDefaultReactSlashMenuItems(editor), setup.plugins),
        query,
      ),
    [editor, setup.plugins],
  );

  const toolbarKey = JSON.stringify(toolbar ?? null);
  const resolvedToolbar = useMemo(
    () => resolveToolbar(setup, toolbar),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compared by value so inline arrays don't re-render the toolbar
    [setup, toolbarKey],
  );
  const toolbarItems = useMemo(
    () => ({ order: resolvedToolbar.items, items: setup.toolbarItems }),
    [resolvedToolbar.items, setup.toolbarItems],
  );

  const dismissCleanup = useCallback(() => setCleanup(null), []);
  const undoCleanup = useCallback(() => {
    if (!cleanup) return;
    const result = pasteWithoutCleanup(editor, cleanup.html, htmlOptions.current, sanitize);
    recordImport.current(result);
    scheduleRehost(result.inserted, "paste", result.report);
    editor.focus();
  }, [cleanup, editor, sanitize, scheduleRehost]);

  const openSlashMenu = useCallback(() => {
    editor.focus();
    editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/");
  }, [editor]);

  return (
    <UploadContext.Provider value={uploadContext}>
      <div
        className={cn("genesis-editor", className)}
        data-color-scheme={colorScheme}
        data-mobile-toolbar={editable && mobileToolbar ? "" : undefined}
        data-toolbar={resolvedToolbar.placement}
        onKeyDownCapture={handleKeyDownCapture}
        onPasteCapture={blockUnsupportedFiles}
        onDropCapture={blockUnsupportedFiles}
        onCopy={stripClipboardMeta}
        onCut={stripClipboardMeta}
      >
        <ToolbarItemsContext.Provider value={toolbarItems}>
          <BlockNoteView
            editor={editor}
            // Also applied to BlockNote's portal roots (menus, toolbars), which the stylesheet is scoped to.
            className="genesis-editor"
            theme={colorScheme}
            editable={editable}
            onChange={handleChange}
            formattingToolbar={false}
            filePanel={false}
            slashMenu={false}
            renderEditor={false}
          >
            {resolvedToolbar.placement === "fixed" && editable && (
              <div className="genesis-fixed-toolbar" data-testid="fixed-toolbar">
                <GenesisFormattingToolbar />
              </div>
            )}
            <BlockNoteViewEditor>
              {resolvedToolbar.placement === "floating" && (
                <FormattingToolbarController formattingToolbar={GenesisFormattingToolbar} />
              )}
              <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
              <FilePanelController filePanel={GenesisFilePanel} />
            </BlockNoteViewEditor>
          </BlockNoteView>
        </ToolbarItemsContext.Provider>
        {editable && mobileToolbar && (
          <MobileBlockToolbar
            editor={editor}
            onAddBlock={openSlashMenu}
            onLink={openLinkDialog}
            showLink={linksEnabled}
          />
        )}
        {cleanup && (
          <CleanupToast summary={cleanup.summary} onUndo={undoCleanup} onDismiss={dismissCleanup} />
        )}
        <LinkDialog
          open={linkDialogOpen}
          initialUrl={linkInitialUrl}
          onClose={closeLinkDialog}
          onSubmit={applyLink}
        />
      </div>
    </UploadContext.Provider>
  );
});
