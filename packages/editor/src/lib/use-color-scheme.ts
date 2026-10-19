import { useSyncExternalStore } from "react";

export type EditorTheme = "light" | "dark" | "system";

const QUERY = "(prefers-color-scheme: dark)";

/** `undefined` where there's no `matchMedia` (jsdom in tests): `"system"` is then light. */
const media = () => (typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : undefined);

function subscribe(onChange: () => void) {
  const list = media();
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
}

export function useColorScheme(theme: EditorTheme): "light" | "dark" {
  const systemDark = useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => false,
  );
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}
