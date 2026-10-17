export type UploadResponseMapper = (
  body: unknown,
  response: Response,
) => string | Promise<string>;

export type UploadConfig = {
  /** Custom upload logic. Receives the file and resolves to its public URL. Takes precedence over `uploadUrl`. */
  uploadFile?: (file: File) => Promise<string>;
  /** Endpoint that accepts a multipart/form-data POST with the file in a `file` field. */
  uploadUrl?: string;
  /** Turns the `uploadUrl` response body (parsed JSON, or text) into the image URL. Defaults to reading `url`. */
  mapUploadResponse?: UploadResponseMapper;
};

export type UploadMode = "custom" | "server" | "local";

export const MAX_LOCAL_UPLOAD_BYTES = 2 * 1024 * 1024;

export function getUploadMode(config: UploadConfig): UploadMode {
  if (config.uploadFile) return "custom";
  if (config.uploadUrl?.trim()) return "server";
  return "local";
}

export function uploadWithConfig(config: UploadConfig, file: File): Promise<string> {
  switch (getUploadMode(config)) {
    case "custom":
      return config.uploadFile!(file);
    case "server":
      return postFile(config.uploadUrl!.trim(), file, config.mapUploadResponse);
    case "local":
      return readAsDataUrl(file);
  }
}

async function postFile(
  uploadUrl: string,
  file: File,
  mapUploadResponse?: UploadResponseMapper,
): Promise<string> {
  const body = new FormData();
  body.append("file", file, file.name);

  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: "POST", body });
  } catch {
    throw new Error(`Couldn't reach the upload server at ${uploadUrl}.`);
  }

  const payload = await readBody(response);
  if (!response.ok) {
    const detail =
      (isRecord(payload) && typeof payload.error === "string" && payload.error) ||
      (typeof payload === "string" && payload.trim().slice(0, 200)) ||
      response.statusText;
    throw new Error(`Upload failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  const url = mapUploadResponse
    ? await mapUploadResponse(payload, response)
    : isRecord(payload)
      ? payload.url
      : undefined;
  if (typeof url !== "string" || !url) {
    throw new Error("The upload server's response didn't include an image URL.");
  }
  // Relative URLs are relative to the upload endpoint, not the editor page.
  return new URL(url, new URL(uploadUrl, window.location.href)).href;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readAsDataUrl(file: File): Promise<string> {
  if (file.size > MAX_LOCAL_UPLOAD_BYTES) {
    return Promise.reject(
      new Error(
        `Images saved in the browser must be under ${MAX_LOCAL_UPLOAD_BYTES / 1024 / 1024} MB. Configure an upload server for larger files.`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsDataURL(file);
  });
}

/** Builds a mapper that reads a dot-separated path such as `data.link` from a JSON response. */
export function mapResponsePath(path: string): UploadResponseMapper {
  const keys = path.split(".").map((key) => key.trim()).filter(Boolean);
  return (body) => {
    const value = keys.reduce<unknown>(
      (current, key) => (isRecord(current) ? current[key] : undefined),
      body,
    );
    if (typeof value !== "string") {
      throw new Error(`The upload response has no string at "${path}".`);
    }
    return value;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
