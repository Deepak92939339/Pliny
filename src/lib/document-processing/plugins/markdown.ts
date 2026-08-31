import {
  assertMaxBytes,
  assertReadableText,
  countWords,
  decodeUtf8,
  DocumentProcessingError,
  normalizeBlockText,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedBlockType,
  type ExtractedUnit,
} from "../types.ts";

const MAX_MARKDOWN_SIZE_BYTES = 5 * 1024 * 1024;

function sanitizeMarkdownSource(source: string) {
  return source
    .replace(/<(script|style|iframe|form|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "\n[unsafe embedded HTML removed]\n")
    .replace(/<(script|style|iframe|form|object|embed)\b[^>]*\/?>/gi, "[unsafe embedded HTML removed]")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "");
}

function getHeading(line: string, nextLine?: string) {
  const atx = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (atx) return { consumedLines: 1, level: atx[1].length, title: atx[2].trim() };
  if (nextLine && line.trim() && /^\s*(=+|-+)\s*$/.test(nextLine)) {
    return { consumedLines: 2, level: nextLine.includes("=") ? 1 : 2, title: line.trim() };
  }
  return null;
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function stripMarkdownNoise(text: string, blockType: ExtractedBlockType) {
  if (blockType === "code") return normalizeBlockText(text);
  return normalizeBlockText(
    text
      .replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm, "- ")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
  );
}

export function buildMarkdownUnits(source: string): ExtractedUnit[] {
  const lines = sanitizeMarkdownSource(source).replace(/\r\n?/g, "\n").split("\n");
  const units: ExtractedUnit[] = [];
  const headingPath: string[] = [];
  let index = 0;

  function addUnit(blockType: ExtractedBlockType, start: number, end: number, text: string, extra: Partial<ExtractedUnit> = {}) {
    const normalized = stripMarkdownNoise(text, blockType);
    if (!normalized) return;
    units.push({
      blockType,
      headingPath: headingPath.filter(Boolean),
      lineEnd: end,
      lineStart: start,
      locationLabel: blockType === "heading" ? `Heading: ${normalized}` : `Lines ${start}-${end}`,
      sourceLocation: `lines:${start}-${end}`,
      text: normalized,
      ...extra,
    });
  }

  while (index < lines.length) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = /^\s*(```+|~~~+)\s*([^\s]*)/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const code: string[] = [];
      let end = lineNumber;
      for (index += 1; index < lines.length; index += 1) {
        if (new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[index])) {
          end = index + 1;
          index += 1;
          break;
        }
        code.push(lines[index]);
        end = index + 1;
      }
      addUnit("code", lineNumber, end, code.join("\n"), { codeLanguage: fence[2] || undefined });
      continue;
    }

    const heading = getHeading(line, lines[index + 1]);
    if (heading) {
      headingPath.splice(heading.level - 1);
      headingPath[heading.level - 1] = heading.title;
      addUnit("heading", lineNumber, lineNumber + heading.consumedLines - 1, heading.title);
      index += heading.consumedLines;
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableSeparator(lines[index + 1])) {
      const tableStart = lineNumber;
      const headers = normalizeExtractedText(line.replace(/^\||\|$/g, "").split("|").join(" | "));
      index += 2;
      let rowNumber = 0;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rowNumber += 1;
        const rowLine = index + 1;
        const row = normalizeExtractedText(lines[index].replace(/^\||\|$/g, "").split("|").join(" | "));
        addUnit("table_row", rowLine, rowLine, `Columns: ${headers}\nRow ${rowNumber}: ${row}`, {
          rowEnd: rowLine,
          rowStart: rowLine,
          tableContext: `Markdown table at line ${tableStart}`,
        });
        index += 1;
      }
      continue;
    }

    const blockType: ExtractedBlockType = /^\s{0,3}>/.test(line)
      ? "blockquote"
      : /^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(line)
        ? "list_item"
        : "paragraph";
    const block: string[] = [];
    const start = lineNumber;
    while (index < lines.length) {
      const candidate = lines[index];
      if (!candidate.trim()) break;
      if (index > start - 1 && (getHeading(candidate, lines[index + 1]) || /^\s*(```+|~~~+)/.test(candidate))) break;
      if (blockType === "list_item" && block.length > 0 && /^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(candidate)) break;
      block.push(candidate);
      index += 1;
    }
    addUnit(blockType, start, Math.max(start, index), block.join("\n"));
  }
  return units;
}

export const markdownProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    const filename = input.filename.toLowerCase();
    return (
      (filename.endsWith(".md") || filename.endsWith(".markdown")) &&
      (input.mimeType === "text/markdown" || input.mimeType === "text/x-markdown" || input.mimeType === "text/plain" || input.mimeType === "application/octet-stream" || input.mimeType === "")
    );
  },
  extensions: [".md", ".markdown"],
  async extract(input) {
    const units = buildMarkdownUnits(decodeUtf8(input.bytes, { fatal: false }));
    const plainText = normalizeExtractedText(units.map((unit) => unit.text).join("\n\n"));
    if (units.length === 0 || plainText.length < 10) throw new DocumentProcessingError("Markdown does not contain enough readable content.");
    return { charCount: plainText.length, extractionMethod: "markdown", kind: "markdown", plainText, title: input.filename, units, warnings: [], wordCount: countWords(plainText) };
  },
  id: "markdown",
  kind: "markdown",
  label: "Markdown",
  maxBytes: MAX_MARKDOWN_SIZE_BYTES,
  mimeTypes: ["text/markdown", "text/x-markdown", "text/plain", "application/octet-stream"],
  validate(input) {
    const filename = input.filename.toLowerCase();
    if (!filename.endsWith(".md") && !filename.endsWith(".markdown")) throw new DocumentProcessingError("Only .md and .markdown files are supported by the Markdown processor.", 400);
    assertMaxBytes(input.bytes, MAX_MARKDOWN_SIZE_BYTES, "Markdown");
    assertReadableText(input.bytes, "Markdown");
  },
};
