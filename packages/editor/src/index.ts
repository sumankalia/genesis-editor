export { BlockEditor } from "./block-editor";
export type { BlockEditorHandle, BlockEditorProps, UploadErrorEvent } from "./block-editor";
export {
  DEFAULT_PERSIST_KEY,
  clearStoredDocument,
  loadStoredDocument,
} from "./lib/persistence";
export type { PersistOptions, PersistStatus, StoredDocument } from "./lib/persistence";
export { MAX_LOCAL_UPLOAD_BYTES, getUploadMode, mapResponsePath, uploadWithConfig } from "./lib/uploads";
export type { UploadConfig, UploadMode, UploadResponseMapper } from "./lib/uploads";
export type { EditorTheme } from "./lib/use-color-scheme";
export type { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
