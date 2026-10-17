import type { Metadata } from "next";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Image uploads" };

const response = `{ "url": "https://cdn.example.com/images/abc123.png" }`;

const mapper = `<BlockEditor
  uploadUrl="https://api.example.com/uploads"
  mapUploadResponse={(body) => (body as { data: { link: string } }).data.link}
/>`;

const route = `// app/api/uploads/route.ts (Next.js)
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Expected a file" }, { status: 400 });
  }
  const url = await saveSomewhere(file); // S3, R2, disk, ...
  return Response.json({ url });
}`;

export default function ImageUploadsPage() {
  return (
    <>
      <DocsHeader
        title="Image uploads"
        description="Add images by URL, or upload them from the device to your server or your own function."
      />

      <p>
        Clicking an empty image block opens a panel with <strong>Upload</strong> and{" "}
        <strong>Link</strong> tabs. Files dropped or pasted into the document upload too. Either way
        the block ends up with a URL in <code>props.url</code>, so an uploaded image behaves exactly
        like a linked one.
      </p>

      <H2>By URL</H2>
      <p>
        No configuration needed. Use the Link tab, or create image blocks with a <code>url</code> in
        your content.
      </p>
      <Example name="image-by-url" minHeight={320} />

      <H2>Upload to an endpoint</H2>
      <p>
        Set <code>uploadUrl</code>. The editor sends a <code>multipart/form-data</code>{" "}
        <code>POST</code> with the file in a field named <code>file</code> and expects a 2xx JSON
        response with the image URL:
      </p>
      <CodeBlock lang="json" code={response} />
      <p>
        This example posts to the docs site&apos;s mock server. Try a file, a drop, or a paste.
      </p>
      <Example name="upload-url" minHeight={240} />

      <H3>A matching server route</H3>
      <CodeBlock code={route} />
      <p>
        A relative <code>url</code> is resolved against <code>uploadUrl</code>. For non-2xx
        responses the editor shows the response&apos;s <code>error</code> field when present.
        Servers on another origin must allow CORS from your page.
      </p>

      <H3>Different response shapes</H3>
      <p>
        Pass <code>mapUploadResponse</code> to read the URL from any body. It receives the parsed
        body (JSON, or text) and the <code>Response</code>. <code>mapResponsePath(&quot;data.link&quot;)</code>{" "}
        builds the same mapper from a dot path.
      </p>
      <CodeBlock code={mapper} />

      <H2>Custom upload function</H2>
      <p>
        For signed URLs, SDKs, or auth headers, pass <code>uploadFile</code>: it receives the{" "}
        <code>File</code> and resolves to its URL. Throw to show an error.{" "}
        <code>uploadFile</code> takes precedence over <code>uploadUrl</code>.
      </p>
      <Example name="upload-custom" minHeight={240} />

      <H2>Errors and retries</H2>
      <p>
        While an upload runs the block shows a spinner. If it fails, the block goes back to
        &quot;Add image&quot; and its panel shows the error with a <strong>Retry</strong> button that
        re-sends the same file. <code>onUploadError</code> receives{" "}
        <code>&#123; error, file, blockId, retry &#125;</code> for your own toast or logging.
      </p>

      <H2>Without a destination</H2>
      <Callout>
        With neither <code>uploadUrl</code> nor <code>uploadFile</code>, files are embedded in the
        document as <code>data:</code> URLs, up to 2 MB each, and the Upload tab says so. That&apos;s
        handy for prototypes; configure a destination for real use.
      </Callout>
    </>
  );
}
