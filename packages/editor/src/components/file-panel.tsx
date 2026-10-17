import { EmbedTab, FilePanel, type FilePanelProps } from "@blocknote/react";

import { UploadTab } from "./upload-tab";

export function GenesisFilePanel({ blockId }: FilePanelProps) {
  return (
    <FilePanel
      blockId={blockId}
      defaultOpenTab="Upload"
      tabs={[
        { name: "Upload", tabPanel: <UploadTab blockId={blockId} /> },
        { name: "Link", tabPanel: <EmbedTab blockId={blockId} /> },
      ]}
    />
  );
}
