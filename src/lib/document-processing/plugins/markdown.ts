import {
  assertMaxBytes,
  assertReadableText,
  countWords,
  decodeUtf8,
  DocumentProcessingError,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedUnit,
} from "@/lib/document-processing/types";
import { buildLineUnits } from "@/lib/document-processing/plugins/text";

const MAX_MARKDOWN_SIZE_BYTES = 5 * 1024 * 1024;

function getHeadingLevel(line: string) {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    title: match[2].trim(),
  };
}

function buildMarkdownUnits(text: string): ExtractedUnit[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const units: ExtractedUnit[] = [];
  const headingPath: string[] = [];
  let currentStart = 1;
  let currentLines: string[] = [];
  let currentHeadingPath: string[] = [];

  function flush(endLine: number) {
    const unitText = normalizeExtractedText(currentLines.join("\n"));

    if (!unitText) {
      currentLines = [];
      return;
    }

    units.push({
      headingPath: currentHeadingPath.length > 0 ? [...currentHeadingPath] : undefined,
      lineEnd: endLine,
      lineStart: currentStart,
      locationLabel: currentHeadingPath.length > 0 ? `Heading: ${currentHeadingPath.at(-1)}` : `Lines ${currentStart}-${endLine}`,
      text: unitText,
    });
    currentLines = [];
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = getHeadingLevel(line);

    if (heading && currentLines.length > 0) {
      flush(lineNumber - 1);
      currentStart = lineNumber;
    }

    if (heading) {
      headingPath.splice(heading.level - 1);
      headingPath[heading.level - 1] = heading.title;
      currentHeadingPath = headingPath.filter(Boolean);
    }

    currentLines.push(line);
  });

  if (currentLines.length > 0) {
    flush(lines.length);
  }

  return units.length > 0 ? units : buildLineUnits(text);
}

export const markdownProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    const filename = input.filename.toLowerCase();
    const hasMarkdownExtension = filename.endsWith(".md") || filename.endsWith(".markdown");

    if (!hasMarkdownExtension) {
      return false;
    }

    return input.mimeType === "text/markdown" || input.mimeType === "text/plain" || input.mimeType === "application/octet-stream" || input.mimeType === "";
  },
  extensions: [".md", ".markdown"],
  async extract(input) {
    const rawText = decodeUtf8(input.bytes, { fatal: false });
    const plainText = normalizeExtractedText(rawText);

    return {
      charCount: plainText.length,
      extractionMethod: "markdown",
      kind: "markdown",
      plainText,
      title: input.filename,
      units: buildMarkdownUnits(rawText),
      warnings: [],
      wordCount: countWords(plainText),
    };
  },
  id: "markdown",
  kind: "markdown",
  label: "Markdown",
  maxBytes: MAX_MARKDOWN_SIZE_BYTES,
  mimeTypes: ["text/markdown", "text/plain", "application/octet-stream"],
  validate(input) {
    const filename = input.filename.toLowerCase();

    if (!filename.endsWith(".md") && !filename.endsWith(".markdown")) {
      throw new DocumentProcessingError("Only .md and .markdown files are supported by the Markdown processor.", 400);
    }

    assertMaxBytes(input.bytes, MAX_MARKDOWN_SIZE_BYTES, "Markdown");
    assertReadableText(input.bytes, "Markdown");
  },
};
