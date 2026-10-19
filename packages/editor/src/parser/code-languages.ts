/** Languages the code-block picker offers. Keys are canonical ids stored on the block and written as `language-*`. */
export type CodeLanguageInfo = {
  name: string;
  aliases?: string[];
};

export const CODE_LANGUAGES: Record<string, CodeLanguageInfo> = {
  text: { name: "Plain Text", aliases: ["txt", "plain", "plaintext"] },
  c: { name: "C" },
  cpp: { name: "C++", aliases: ["c++"] },
  css: { name: "CSS" },
  glsl: { name: "GLSL" },
  graphql: { name: "GraphQL", aliases: ["gql"] },
  haml: { name: "Ruby Haml" },
  html: { name: "HTML" },
  java: { name: "Java" },
  javascript: { name: "JavaScript", aliases: ["js"] },
  json: { name: "JSON" },
  jsonc: { name: "JSON with Comments" },
  jsonl: { name: "JSON Lines" },
  jsx: { name: "JSX" },
  julia: { name: "Julia", aliases: ["jl"] },
  less: { name: "Less" },
  markdown: { name: "Markdown", aliases: ["md"] },
  mdx: { name: "MDX" },
  php: { name: "PHP" },
  postcss: { name: "PostCSS" },
  pug: { name: "Pug", aliases: ["jade"] },
  python: { name: "Python", aliases: ["py"] },
  r: { name: "R" },
  regexp: { name: "RegExp", aliases: ["regex"] },
  sass: { name: "Sass" },
  scss: { name: "SCSS" },
  shellscript: { name: "Shell", aliases: ["bash", "sh", "shell", "zsh"] },
  sql: { name: "SQL" },
  svelte: { name: "Svelte" },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  vue: { name: "Vue" },
  "vue-html": { name: "Vue HTML" },
  wasm: { name: "WebAssembly" },
  wgsl: { name: "WGSL" },
  xml: { name: "XML" },
  yaml: { name: "YAML", aliases: ["yml"] },
  tsx: { name: "TSX", aliases: ["typescriptreact"] },
  haskell: { name: "Haskell", aliases: ["hs"] },
  csharp: { name: "C#", aliases: ["c#", "cs"] },
  latex: { name: "LaTeX", aliases: ["tex"] },
  lua: { name: "Lua" },
  mermaid: { name: "Mermaid", aliases: ["mmd"] },
  ruby: { name: "Ruby", aliases: ["rb"] },
  rust: { name: "Rust", aliases: ["rs"] },
  scala: { name: "Scala" },
  swift: { name: "Swift" },
  kotlin: { name: "Kotlin", aliases: ["kt", "kts"] },
  "objective-c": { name: "Objective-C", aliases: ["objc"] },
  go: { name: "Go", aliases: ["golang"] },
  dockerfile: { name: "Dockerfile", aliases: ["docker"] },
};

const LANGUAGE_TOKEN = /^[a-z0-9+#._-]{1,30}$/;

function lookup(raw: string): string | undefined {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized in CODE_LANGUAGES) return normalized;
  for (const [id, info] of Object.entries(CODE_LANGUAGES)) {
    if (info.aliases?.some((alias) => alias.toLowerCase() === normalized)) return id;
  }
  return undefined;
}

/**
 * Canonical language id for the picker (`ts` → `typescript`). `text` and unknown names
 * return `undefined` so the block stores no language (plain text).
 */
export function canonicalizeCodeLanguage(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const id = lookup(raw);
  return !id || id === "text" ? undefined : id;
}

/** Language stored on a parsed block: canonical when known, otherwise the original token. */
export function storedCodeLanguage(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const canonical = canonicalizeCodeLanguage(raw);
  if (canonical) return canonical;
  const token = raw.trim().toLowerCase();
  if (token && token !== "text" && LANGUAGE_TOKEN.test(token) && !lookup(token)) return token;
  return undefined;
}
