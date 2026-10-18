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

const fromUrl = `<BlockEditor
  uploadUrl="/api/uploads"                 // files the user adds
  uploadFromUrl="/api/uploads/from-url"    // pasted and loaded images, copied by your server
  uploadHeaders={async () => ({ Authorization: \`Bearer \${await getToken()}\` })}
  rehostImages="auto"                      // or "off", or (url) => boolean
  uploadConcurrency={4}
/>`;

const fromUrlBody = `// POST /api/uploads/from-url
{ "url": "https://other.site/photo.jpg", "alt": "A photo", "filename": "photo.jpg" }
// → 200 { "url": "https://cdn.example.com/images/def456.jpg" }`;

const remoteFn = `<BlockEditor
  uploadFile={(file, { signal, onProgress }) => uploadToS3(file, { signal, onProgress })}
  uploadRemote={(url, { signal }) => copyToS3(url, { signal })}
/>`;

const trusted = `<BlockEditor
  uploadUrl="/api/uploads"
  uploadFromUrl="/api/uploads/from-url"
  trustedHosts={["cdn.example.com", "*.assets.example.com"]}   // or (url) => boolean
/>`;

const saving = `const editor = useRef<BlockEditorHandle>(null);

async function save() {
  await editor.current?.uploadsSettled(); // final image URLs, not the remote ones
  await api.save(editor.current?.getHTML());
}`;

const server = `import { parseHTMLAsync } from "genesis-editor/parser";
import { linkedomDom } from "genesis-editor/parser/linkedom";

const { blocks, report } = await parseHTMLAsync(html, {
  dom: linkedomDom,
  uploadRemote: (url, { signal }) => copyToStorage(url, { signal }),
});
report.images.rehosted;     // copied
report.images.rehostFailed; // kept their original URL`;

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

      <p>
        <code>uploadFile</code> also receives <code>&#123; signal, onProgress, blockId, source &#125;</code>.
        Pass <code>uploadHeaders</code> (an object, or a function returning one) to add auth headers
        to <code>uploadUrl</code> and <code>uploadFromUrl</code> requests.
      </p>

      <H2>Pasted and loaded images</H2>
      <p>
        Images pasted from other sites, or loaded with an HTML <code>value</code>,{" "}
        <code>setHTML</code> or <code>setBlocks</code>, still point at their original host. When an
        upload destination is configured, the editor copies them to it in the background. The paste
        is never blocked: blocks appear right away with the original image, a badge shows the
        progress, and the URL is swapped when the copy is ready. The swap isn&apos;t an undo step, so
        undo never brings the remote URL back, and <code>props.originalUrl</code> keeps the source.
      </p>
      <CodeBlock code={fromUrl} />
      <p>
        With <code>uploadFromUrl</code> the editor sends the image&apos;s URL, and your server
        downloads it, so there&apos;s no CORS problem:
      </p>
      <CodeBlock lang="json" code={fromUrlBody} />
      <Callout>
        A server that fetches URLs for users must block SSRF: refuse private, loopback and
        link-local addresses (also after redirects), cap the size, and check the content type. The
        editor only ever sends <code>http(s)</code> URLs. The docs site&apos;s mock endpoint shows one
        way to do it.
      </Callout>
      <p>
        Without a URL uploader, the browser downloads the image and sends it through{" "}
        <code>uploadFile</code> or <code>uploadUrl</code>. That only works when the image&apos;s host
        allows CORS; otherwise the image keeps its URL. Pasted <code>data:</code> images are always
        sent as files. With no destination at all they stay inline up to 1 MB, and larger ones are
        left out of the paste with a warning in the import report.
      </p>
      <p>
        For custom storage, <code>uploadRemote(url, ctx)</code> replaces <code>uploadFromUrl</code>,
        the same way <code>uploadFile</code> replaces <code>uploadUrl</code>:
      </p>
      <CodeBlock code={remoteFn} />
      <p>
        Up to <code>uploadConcurrency</code> copies (4 by default) run at once, in document order,
        each with a 30 s timeout. The same image pasted twice is copied once. A copy is aborted when
        its block is deleted or the editor unmounts. <code>rehostImages=&quot;auto&quot;</code> skips
        images on your page&apos;s origin, on your upload endpoints&apos; hosts and on hosts earlier
        uploads returned.
      </p>
      <p>
        Images that are already on your storage are never copied. Direct uploads and finished
        copies set <code>props.hosted</code>, which HTML export writes as{" "}
        <code>data-genesis-hosted</code> (copies also carry <code>data-original-src</code>), so
        loading the document again in a later session leaves them alone. Giving the image a
        different URL clears the flag. For images your storage serves from other hosts, such as a
        CDN, list them in <code>trustedHosts</code>; their images are never re-hosted, whatever{" "}
        <code>rehostImages</code> says:
      </p>
      <CodeBlock code={trusted} />
      <p>
        Paste the article below. The mock server waits 1.5 s per image so you can see the badges;
        tick &quot;Make the server fail&quot; first to see the retry. &quot;Save when uploads
        finish&quot; waits with <code>uploadsSettled()</code> before reading the HTML.
      </p>
      <Example name="image-rehost" minHeight={420} />

      <H3>Saving after uploads</H3>
      <p>
        <code>ref.current.pendingUploads</code> counts the file uploads and copies still running,
        and <code>await ref.current.uploadsSettled()</code> waits for all of them, so a save
        stores the final URLs. Failed copies count as settled.
      </p>
      <CodeBlock code={saving} />

      <H3>On the server</H3>
      <p>
        For bulk imports, <code>parseHTMLAsync</code> from <code>genesis-editor/parser</code> copies
        the images before it returns, with the same queue, retry and deduplication.
      </p>
      <CodeBlock code={server} />

      <H2>Errors and retries</H2>
      <p>
        While an upload runs the block shows a spinner. If it fails, the block goes back to
        &quot;Add image&quot; and its panel shows the error with a <strong>Retry</strong> button that
        re-sends the same file. A failed copy of a pasted image is retried once automatically on
        network errors and 5xx responses (not on 4xx); then the image keeps its original URL and
        shows <strong>Not re-uploaded · Retry</strong>. <code>onUploadError</code> receives{" "}
        <code>&#123; kind: &quot;file&quot;, error, file, blockId, retry &#125;</code> or{" "}
        <code>&#123; kind: &quot;rehost&quot;, error, url, blockId, retry &#125;</code> for your own
        toast or logging.
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
