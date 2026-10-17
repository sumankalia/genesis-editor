import { useSyncExternalStore } from "react";

export type EditorTheme = "light" | "dark" | "system";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useColorScheme(theme: EditorTheme): "light" | "dark" {
  const systemDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}
