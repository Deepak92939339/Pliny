import { createElement, Fragment, type ReactNode } from "react";
import { tokenizeSafeInlineMarkdown } from "../../lib/markdown/safeInline.ts";

function renderTokens(text: string, keyPrefix: string): ReactNode[] {
  return tokenizeSafeInlineMarkdown(text).map((token, index) => {
    const key = `${keyPrefix}-${token.type}-${index}`;

    if (token.type === "strong") {
      return createElement(
        "strong",
        { className: "font-semibold text-[color:var(--editorial-ink)]", key },
        ...renderTokens(token.value, key)
      );
    }

    if (token.type === "code") {
      return createElement(
        "code",
        {
          className:
            "rounded-[5px] border border-[color:var(--editorial-border-soft)] bg-[var(--editorial-panel)] px-1 py-0.5 font-mono text-[0.88em] text-[color:var(--editorial-ink)]",
          key,
        },
        token.value
      );
    }

    return createElement("span", { key }, token.value);
  });
}

export function SafeInlineMarkdown({ text }: { text: string }) {
  return createElement(Fragment, null, ...renderTokens(text, "safe-inline"));
}
