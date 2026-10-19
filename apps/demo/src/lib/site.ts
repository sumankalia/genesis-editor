import editorPackage from "genesis-editor/package.json";

export const site = {
  name: "genesis-editor",
  version: editorPackage.version,
  description: editorPackage.description,
  url: "https://genesis-editor-three.vercel.app",
  repoUrl: "https://github.com/sumankalia/genesis-editor",
  npmUrl: "https://www.npmjs.com/package/genesis-editor",
  installCommand: "npm install genesis-editor",
};

export type NavItem = { title: string; href: string };

export const docsNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Guide",
    items: [
      { title: "Getting started", href: "/docs/getting-started" },
      { title: "Usage", href: "/docs/usage" },
      { title: "Image uploads", href: "/docs/image-uploads" },
      { title: "Embeds", href: "/docs/embeds" },
      { title: "Link previews", href: "/docs/link-previews" },
      { title: "Colors", href: "/docs/colors" },
      { title: "Font size", href: "/docs/font-size" },
      { title: "Code blocks", href: "/docs/code-blocks" },
      { title: "Theming", href: "/docs/theming" },
      { title: "Tools & plugins", href: "/docs/tools" },
      { title: "HTML & paste", href: "/docs/html" },
      { title: "Markdown", href: "/docs/markdown" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "API reference", href: "/docs/api" },
      { title: "Keyboard shortcuts", href: "/docs/shortcuts" },
    ],
  },
];

export const mainNav: NavItem[] = [
  { title: "Docs", href: "/docs/getting-started" },
  { title: "Playground", href: "/playground" },
];
