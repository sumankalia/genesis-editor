"use client";

import { useTheme } from "next-themes";

/** The docs site's resolved theme, passed to example editors so they match the page. */
export function useSiteTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "dark" : "light";
}
