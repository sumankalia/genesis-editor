"use client";

import { useEffect, useState } from "react";

import { HighlightedCode } from "@/components/site/highlighted-code";

type Lang = "tsx" | "json" | "md";

function escapeHtml(code: string) {
  return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ClientCode({ code, lang }: { code: string; lang: Lang }) {
  const [highlighted, setHighlighted] = useState<{ code: string; html: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("shiki").then(({ codeToHtml }) =>
      codeToHtml(code, {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
        defaultColor: false,
      }).then((html) => {
        if (!cancelled) setHighlighted({ code, html });
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const html =
    highlighted?.code === code
      ? highlighted.html
      : `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;

  return (
    <HighlightedCode
      code={code}
      html={html}
      className="max-h-[32rem] overflow-y-auto"
    />
  );
}
