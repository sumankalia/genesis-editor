import { FileUp } from "lucide-react";

import { DocumentImportError, importDocument } from "../parser/document-import";
import type { FidelityReport, ParseOptions } from "../parser/types";
import type { AnyEditor, SlashMenuItem } from "./types";

export type GoogleDriveImport = {
  /** Opens a picker and returns a file. No OAuth is built in; the host supplies the file. */
  pickFile: () => Promise<File | null>;
};

export type DocumentImportHandler = {
  openPicker: () => void;
  importFile: (file: File) => Promise<FidelityReport>;
  googleDrive?: GoogleDriveImport;
};

const handlers = new WeakMap<object, DocumentImportHandler>();

export function registerDocumentImport(editor: object, handler: DocumentImportHandler | null) {
  if (handler) handlers.set(editor, handler);
  else handlers.delete(editor);
}

export const DOCUMENT_IMPORT_ACCEPT =
  ".docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt,.pages,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf,text/rtf,text/html,text/markdown,text/plain";

export async function importFileSource(file: File, options?: ParseOptions) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await importDocument({ name: file.name, type: file.type, bytes }, options);
  return { ...result, filename: file.name };
}

export function importSlashItems(editor: AnyEditor): SlashMenuItem[] {
  const handler = handlers.get(editor);
  const items: SlashMenuItem[] = [
    {
      key: "import-document",
      title: "Import document",
      subtext: "Word, OpenDocument, HTML, Markdown, or text",
      aliases: ["import", "word", "docx", "odt", "markdown", "html", "rtf", "upload"],
      group: "Media",
      icon: <FileUp size={16} />,
      onItemClick: () => handler?.openPicker(),
    },
  ];
  if (handler?.googleDrive) {
    items.push({
      key: "import-google-drive",
      title: "Import from Google Drive",
      subtext: "Pick a file your app already has access to",
      aliases: ["gdrive", "google", "drive"],
      group: "Media",
      icon: <FileUp size={16} />,
      onItemClick: () => {
        void handler.googleDrive?.pickFile().then((file) => {
          if (file) void handler.importFile(file);
        });
      },
    });
  }
  return items;
}

export { DocumentImportError };
