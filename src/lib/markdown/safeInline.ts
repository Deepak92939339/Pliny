export type SafeInlineToken =
  | { type: "citation"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; value: string }
  | { type: "text"; value: string };

const SAFE_INLINE_PATTERN = /(\[\[(?:s|p)\.\d+\]\]|\*\*[^*]+\*\*|`[^`\n]+`)/g;

export function tokenizeSafeInlineMarkdown(value: string): SafeInlineToken[] {
  return String(value)
    .split(SAFE_INLINE_PATTERN)
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      if (/^\[\[(?:s|p)\.\d+\]\]$/.test(segment)) {
        return { type: "citation" as const, value: segment };
      }

      if (segment.startsWith("**") && segment.endsWith("**")) {
        return { type: "strong" as const, value: segment.slice(2, -2).trim() };
      }

      if (segment.startsWith("`") && segment.endsWith("`")) {
        return { type: "code" as const, value: segment.slice(1, -1).trim() };
      }

      return { type: "text" as const, value: segment };
    });
}
