import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlockEditor } from "../src/block-editor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BlockEditor rendering", () => {
  it("server-renders an empty root instead of touching window or DOMParser", () => {
    const html = renderToString(createElement(BlockEditor, { format: "html", defaultValue: "<h2>Hi</h2>", className: "notes" }));
    expect(html).toBe('<div class="genesis-editor notes" data-genesis-pending=""></div>');
    const md = renderToString(createElement(BlockEditor, { format: "markdown", defaultValue: "# Hi", className: "notes" }));
    expect(md).toBe('<div class="genesis-editor notes" data-genesis-pending=""></div>');
  });

  it("mounts on the client without matchMedia (jsdom), with theme system as light", async () => {
    expect(typeof window.matchMedia).not.toBe("function");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(BlockEditor, { format: "html", defaultValue: "<h2>Hello</h2><p>World</p>" })));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(container.querySelector(".bn-editor h2")?.textContent).toBe("Hello");
    expect(container.querySelector(".genesis-editor")?.getAttribute("data-color-scheme")).toBe("light");
    expect(container.querySelector("[data-genesis-pending]")).toBeNull();
    await act(async () => root.unmount());
  });
});
