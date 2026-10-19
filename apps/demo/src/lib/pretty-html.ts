const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "details", "dd", "div", "dl", "dt", "figcaption", "figure",
  "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
  "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul", "iframe", "img", "video", "audio",
]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** Elements whose content is written exactly as it is. */
const RAW = new Set(["pre", "script", "style", "textarea"]);

type Node = { tag: string | null; open: string; close: string; children: Node[] };

const TOKEN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;

function tagName(token: string) {
  return token.match(/^<\/?([a-zA-Z][^\s/>]*)/)?.[1]?.toLowerCase() ?? null;
}

function parse(html: string) {
  const root: Node = { tag: null, open: "", close: "", children: [] };
  const stack = [root];
  const tokens = html.match(TOKEN) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const parent = stack[stack.length - 1];
    const name = token.startsWith("<") && !token.startsWith("<!") ? tagName(token) : null;
    if (!name) {
      parent.children.push({ tag: null, open: token, close: "", children: [] });
    } else if (token.startsWith("</")) {
      const at = stack.findLastIndex((node) => node.tag === name);
      if (at > 0) {
        stack[at].close = token;
        stack.length = at;
      } else {
        parent.children.push({ tag: null, open: token, close: "", children: [] });
      }
    } else {
      const node: Node = { tag: name, open: token, close: "", children: [] };
      parent.children.push(node);
      if (RAW.has(name)) {
        let text = "";
        while (i + 1 < tokens.length && tagName(tokens[i + 1]) !== name) text += tokens[++i];
        node.children.push({ tag: null, open: text, close: "", children: [] });
        if (i + 1 < tokens.length) node.close = tokens[++i];
      } else if (!VOID.has(name) && !token.endsWith("/>")) {
        stack.push(node);
      }
    }
  }
  return root;
}

const raw = (node: Node): string => node.open + node.children.map(raw).join("") + node.close;
const isBlock = (node: Node) => node.tag !== null && BLOCK.has(node.tag);

function render(nodes: Node[], depth: number, lines: string[]) {
  const indent = "  ".repeat(depth);
  let inline = "";
  const flush = () => {
    if (inline.trim()) lines.push(indent + inline.trim());
    inline = "";
  };
  for (const node of nodes) {
    if (!isBlock(node)) {
      inline += raw(node);
    } else if (RAW.has(node.tag!) || !node.children.some(isBlock)) {
      flush();
      lines.push(indent + raw(node));
    } else {
      flush();
      lines.push(indent + node.open);
      render(node.children, depth + 1, lines);
      if (node.close) lines.push(indent + node.close);
    }
  }
  flush();
}

/**
 * Indents HTML for reading: block elements that hold other blocks get one child per line; paragraphs
 * and other blocks with only inline content stay on one line, and `<pre>` is never touched, so the
 * output reads back to the same blocks.
 */
export function prettyHTML(html: string) {
  const lines: string[] = [];
  render(parse(html).children, 0, lines);
  return lines.join("\n");
}
