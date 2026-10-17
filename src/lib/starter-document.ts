import type { PartialBlock } from "@blocknote/core";

export const starterDocument: PartialBlock[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: "Welcome to Genesis",
  },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Every line here is its own ", styles: {} },
      { type: "text", text: "block", styles: { bold: true } },
      {
        type: "text",
        text: ". Hover a block to grab its handle and drag it, or press ",
        styles: {},
      },
      { type: "text", text: "/", styles: { code: true } },
      { type: "text", text: " to insert or change a block.", styles: {} },
    ],
  },
  {
    type: "heading",
    props: { level: 2 },
    content: "Try it",
  },
  {
    type: "checkListItem",
    props: { checked: true },
    content: "Type / on an empty line to open the block menu",
  },
  {
    type: "checkListItem",
    content: "Select text to bold, italicize, code, or link it",
    children: [
      {
        type: "checkListItem",
        content: "Press Tab to nest a block, Shift+Tab to lift it back out",
      },
    ],
  },
  {
    type: "checkListItem",
    content: "Start a line with #, -, >, [] or ``` to convert it",
  },
  { type: "divider" },
  {
    type: "quote",
    content: "Your changes save to this browser automatically.",
  },
  {
    type: "codeBlock",
    content: 'const blocks = editor.document;\nconsole.log(blocks.length, "blocks");',
  },
  { type: "paragraph" },
];
