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
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { FilePanelExtension, SuggestionMenu } from "@blocknote/core/extensions";
import {
  FilePanelController,
  FormattingToolbarController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";

import { GenesisFilePanel } from "./components/file-panel";
import { GenesisFormattingToolbar } from "./components/formatting-toolbar";
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
import { UploadStatusStore } from "./lib/upload-status";
import { getUploadMode, uploadWithConfig, type UploadConfig } from "./lib/uploads";
import { useColorScheme, type EditorTheme } from "./lib/use-color-scheme";

export type UploadErrorEvent = {
  error: Error;
  file: File;
  /** The image block the file was meant for. */
  blockId: string;
  /** Uploads the same file to the same block again. */
  retry: () => Promise<void>;
};

export type BlockEditorProps = UploadConfig & {
  /** Content for the first render (uncontrolled). Ignored when `value` is set or a persisted document is found. */
  initialContent?: PartialBlock[];
  /** Controlled content. When it changes to something other than the current document, the editor content is replaced. */
  value?: PartialBlock[];
  /** Called after every user edit with the full document. */
  onChange?: (blocks: Block[], editor: BlockNoteEditor) => void;
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
};

export type BlockEditorHandle = {
  /** The underlying BlockNote editor, for anything the props don't cover. */
  editor: BlockNoteEditor;
  focus: () => void;
  getBlocks: () => Block[];
  /** Replaces the whole document. Counts as an edit for `onChange` and persistence. */
  setBlocks: (blocks: PartialBlock[]) => void;
  /** Lossy Markdown export of the current document. */
  getMarkdown: () => string;
  /** Removes the persisted copy from localStorage and cancels any pending save. */
  clearPersisted: () => void;
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

function nonEmpty(blocks: PartialBlock[] | undefined) {
  return blocks && blocks.length > 0 ? blocks : undefined;
}

export const BlockEditor = forwardRef<BlockEditorHandle, BlockEditorProps>(function BlockEditor(
  {
    initialContent,
    value,
    onChange,
    persist,
    onPersistStatusChange,
    uploadFile,
    uploadUrl,
    mapUploadResponse,
    onUploadError,
    theme = "system",
    editable = true,
    className,
    mobileToolbar = true,
    onConfigureUploads,
  },
  ref,
) {
  const persistOptions = resolvePersistOptions(persist);
  const persistKey = persistOptions?.key ?? null;
  const debounceMs = persistOptions?.debounceMs ?? 0;
  // Content and persistence key are read once: changing them later would need a new editor.
  const [initial] = useState(() => {
    const stored = persistKey ? loadStoredDocument(persistKey) : null;
    return {
      key: persistKey,
      stored,
      content: nonEmpty(value) ?? stored?.blocks ?? nonEmpty(initialContent),
    };
  });

  const callbacks = useRef({ onChange, onPersistStatusChange, onUploadError });
  // BlockNote captures `uploadFile` once at creation, so it reads the latest config through a ref.
  const uploadConfig = useRef<UploadConfig>({});
  useLayoutEffect(() => {
    callbacks.current = { onChange, onPersistStatusChange, onUploadError };
    uploadConfig.current = { uploadFile, uploadUrl, mapUploadResponse };
  });

  const [uploadStatuses] = useState(() => new UploadStatusStore());
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const retryRef = useRef<(blockId: string) => Promise<void>>(async () => {});

  const editor = useCreateBlockNote({
    initialContent: initial.content,
    // Never rejects: paste/drop uploads would surface as unhandled rejections, so
    // failures are recorded per block and shown in that block's file panel instead.
    uploadFile: async (file, blockId) => {
      if (blockId) uploadStatuses.set(blockId, { state: "uploading", file });
      try {
        const url = await uploadWithConfig(uploadConfig.current, file);
        if (blockId) uploadStatuses.delete(blockId);
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
          error,
          file,
          blockId,
          retry: () => retryRef.current(blockId),
        });
        return {};
      }
    },
  });
  const colorScheme = useColorScheme(theme);

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
      const savedAt = saveStoredDocument(initial.key, editor.document);
      callbacks.current.onPersistStatusChange?.({ status: "saved", savedAt });
    } catch (error) {
      callbacks.current.onPersistStatusChange?.({ status: "error", error });
    }
  }, [editor, initial.key]);

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
  const lastEmitted = useRef<Block[] | null>(null);
  const lastValueJson = useRef<string | null>(value ? JSON.stringify(value) : null);
  const applyingValue = useRef(false);

  useEffect(() => {
    if (!value) return;
    if (value === lastEmitted.current) {
      lastValueJson.current = null;
      return;
    }
    const json = JSON.stringify(value);
    if (json === lastValueJson.current) return;
    lastValueJson.current = json;
    if (json === JSON.stringify(editor.document)) return;
    applyingValue.current = true;
    try {
      editor.replaceBlocks(editor.document, value);
    } finally {
      applyingValue.current = false;
    }
  }, [editor, value]);

  const handleChange = useCallback(() => {
    scheduleSave();
    if (applyingValue.current) return;
    const blocks = editor.document;
    lastEmitted.current = blocks;
    callbacks.current.onChange?.(blocks, editor);
  }, [editor, scheduleSave]);

  useImperativeHandle(
    ref,
    () => ({
      editor,
      focus: () => editor.focus(),
      getBlocks: () => editor.document,
      setBlocks: (blocks) => editor.replaceBlocks(editor.document, blocks),
      getMarkdown: () => editor.blocksToMarkdownLossy(editor.document),
      clearPersisted: () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (initial.key) clearStoredDocument(initial.key);
      },
    }),
    [editor, initial.key],
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

  // BlockNote has no link shortcut; its toolbar link button needs a selection.
  const handleKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!editable || !mod || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.target instanceof Element) || !event.target.closest(".bn-editor")) return;
      event.preventDefault();
      event.stopPropagation();
      openLinkDialog();
    },
    [editable, openLinkDialog],
  );

  const openSlashMenu = useCallback(() => {
    editor.focus();
    editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/");
  }, [editor]);

  return (
    <UploadContext.Provider value={uploadContext}>
      <div
        className={cn("genesis-editor", className)}
        data-color-scheme={colorScheme}
        onKeyDownCapture={handleKeyDownCapture}
      >
        <BlockNoteView
          editor={editor}
          // Also applied to BlockNote's portal roots (menus, toolbars), which the stylesheet is scoped to.
          className="genesis-editor"
          theme={colorScheme}
          editable={editable}
          onChange={handleChange}
          formattingToolbar={false}
          filePanel={false}
        >
          <FormattingToolbarController formattingToolbar={GenesisFormattingToolbar} />
          <FilePanelController filePanel={GenesisFilePanel} />
        </BlockNoteView>
        {editable && mobileToolbar && (
          <MobileBlockToolbar editor={editor} onAddBlock={openSlashMenu} onLink={openLinkDialog} />
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
