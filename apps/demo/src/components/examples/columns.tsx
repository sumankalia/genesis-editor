"use client";

import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const html = `<h2>Summer drop</h2>
<p>A product image beside its copy, the way Google Docs wraps two columns — not a table of images.</p>
<table>
  <tr>
    <td><img src="/examples/lake.png" alt="A mountain lake" width="640" height="427"></td>
    <td>
      <h3>Mountain lake</h3>
      <p>Each column holds the same blocks as the rest of the document: headings, paragraphs, images, lists.</p>
      <p>Drag the handle between columns to resize. On a phone they stack.</p>
    </td>
  </tr>
</table>`;

export default function ColumnsExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      format="html"
      defaultValue={html}
    />
  );
}
