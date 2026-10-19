import type { AnyPartialBlock } from "genesis-editor";

export const starterDocument: AnyPartialBlock[] = [
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
    props: { language: "javascript" },
    content: 'const blocks = editor.document;\nconsole.log(blocks.length, "blocks");',
  },
  { type: "divider" },
  {
    type: "heading",
    props: { level: 2 },
    content: "Columns",
  },
  {
    type: "paragraph",
    content: "A product image beside its copy, like Google Docs — not a table of images.",
  },
  {
    type: "columnList",
    children: [
      {
        type: "column",
        props: { width: 40 },
        children: [
          {
            type: "image",
            props: {
              url: "/examples/lake.png",
              alt: "A mountain lake",
              name: "A mountain lake",
            },
          },
        ],
      },
      {
        type: "column",
        props: { width: 60 },
        children: [
          {
            type: "heading",
            props: { level: 3 },
            content: "Mountain lake",
          },
          {
            type: "paragraph",
            content: "Each column holds the same blocks as the rest of the document: headings, paragraphs, images, lists.",
          },
          {
            type: "paragraph",
            content: "Drag the handle between columns to resize. On a phone they stack.",
          },
        ],
      },
    ],
  },
  { type: "paragraph" },
];
