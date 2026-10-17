"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { SuggestionMenu } from "@blocknote/core/extensions";
import { FormattingToolbarController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { EditorHeader, type SaveState } from "@/components/editor/editor-header";
import { GenesisFormattingToolbar } from "@/components/editor/formatting-toolbar";
import { LinkDialog } from "@/components/editor/link-dialog";
import { MobileBlockToolbar } from "@/components/editor/mobile-block-toolbar";
import { clearDocument, loadDocument, saveDocument } from "@/lib/storage";
import { starterDocument } from "@/lib/starter-document";

const AUTOSAVE_DELAY_MS = 400;

export default function BlockEditor() {
  const stored = useMemo(() => loadDocument(), []);
  const editor = useCreateBlockNote({
    initialContent: stored?.blocks ?? starterDocument,
  });
  const { resolvedTheme } = useTheme();

  const [saveState, setSaveState] = useState<SaveState>(
    stored ? { status: "saved", savedAt: stored.savedAt } : { status: "idle" },
  );
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkInitialUrl, setLinkInitialUrl] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      const savedAt = saveDocument(editor.document);
      setSaveState({ status: "saved", savedAt });
    } catch {
      setSaveState({ status: "error" });
    }
  }, [editor]);

  const scheduleSave = useCallback(() => {
    setSaveState({ status: "saving" });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, AUTOSAVE_DELAY_MS);
  }, [flushSave]);

  useEffect(() => {
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
  }, [flushSave]);

  const openLinkDialog = useCallback(() => {
    setLinkInitialUrl(editor.getSelectedLinkUrl() ?? "");
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(
    (url: string) => {
      setLinkDialogOpen(false);
      editor.focus();
      if (editor.getSelectedText()) {
        editor.createLink(url);
      } else {
        editor.createLink(url, url);
      }
    },
    [editor],
  );

  // BlockNote has no link shortcut; its toolbar link button needs a selection.
  const handleKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        openLinkDialog();
      }
    },
    [openLinkDialog],
  );

  const openSlashMenu = useCallback(() => {
    editor.focus();
    editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/");
  }, [editor]);

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        editor.blocksToMarkdownLossy(editor.document),
      );
      toast.success("Copied document as Markdown");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }, [editor]);

  const resetDocument = useCallback(() => {
    if (!window.confirm("Replace this document with the starter content?")) return;
    clearDocument();
    editor.replaceBlocks(editor.document, starterDocument);
    flushSave();
    toast.success("Document reset");
  }, [editor, flushSave]);

  return (
    <div className="flex min-h-dvh flex-col">
      <EditorHeader
        saveState={saveState}
        onCopyMarkdown={copyMarkdown}
        onReset={resetDocument}
      />
      <main className="flex flex-1 justify-center px-0 pb-28 pt-6 sm:px-6 sm:pb-16 sm:pt-12">
        <div
          className="genesis-editor w-full max-w-3xl"
          onKeyDownCapture={handleKeyDownCapture}
        >
          <BlockNoteView
            editor={editor}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            onChange={scheduleSave}
            formattingToolbar={false}
          >
            <FormattingToolbarController
              formattingToolbar={GenesisFormattingToolbar}
            />
          </BlockNoteView>
        </div>
      </main>
      <MobileBlockToolbar
        editor={editor}
        onAddBlock={openSlashMenu}
        onLink={openLinkDialog}
      />
      <LinkDialog
        open={linkDialogOpen}
        initialUrl={linkInitialUrl}
        onOpenChange={(open) => {
          setLinkDialogOpen(open);
          if (!open) editor.focus();
        }}
        onSubmit={applyLink}
      />
    </div>
  );
}
