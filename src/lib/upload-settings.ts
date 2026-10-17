export const UPLOAD_SETTINGS_KEY = "genesis:upload-settings:v1";

export const MOCK_UPLOAD_URL = "/api/mock-upload";

export type UploadSettings = {
  mode: "local" | "server" | "custom";
  uploadUrl: string;
  /** Dot path to the URL in the server's JSON response. Empty means `url`. */
  responsePath: string;
};

export const defaultUploadSettings: UploadSettings = {
  mode: "local",
  uploadUrl: MOCK_UPLOAD_URL,
  responsePath: "",
};

export function loadUploadSettings(): UploadSettings {
  try {
    const raw = window.localStorage.getItem(UPLOAD_SETTINGS_KEY);
    if (!raw) return defaultUploadSettings;
    const parsed = JSON.parse(raw) as Partial<UploadSettings>;
    return {
      mode: parsed.mode === "server" || parsed.mode === "custom" ? parsed.mode : "local",
      uploadUrl: typeof parsed.uploadUrl === "string" ? parsed.uploadUrl : MOCK_UPLOAD_URL,
      responsePath: typeof parsed.responsePath === "string" ? parsed.responsePath : "",
    };
  } catch {
    return defaultUploadSettings;
  }
}

export function saveUploadSettings(settings: UploadSettings) {
  window.localStorage.setItem(UPLOAD_SETTINGS_KEY, JSON.stringify(settings));
}

/** Example `uploadFile` implementation: your own request logic, returning the URL. */
export async function demoUploadFile(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${MOCK_UPLOAD_URL}?shape=nested`, { method: "POST", body });
  const json = (await response.json().catch(() => null)) as
    | { data?: { link?: string }; error?: string }
    | null;
  if (!response.ok || !json?.data?.link) {
    throw new Error(json?.error ?? `Upload failed (${response.status})`);
  }
  return new URL(json.data.link, window.location.href).href;
}
