import { parse } from "parse5";
import {
  assertMaxBytes,
  countWords,
  DocumentProcessingError,
  normalizeBlockText,
  normalizeExtractedText,
  type DocumentProcessorPlugin,
  type ExtractedBlockType,
  type ExtractedUnit,
} from "../types.ts";

const MAX_HTML_SIZE_BYTES = 5 * 1024 * 1024;
const HTML_MIME_TYPES = new Set(["text/html", "text/plain", "application/octet-stream", ""]);
const SKIPPED_ELEMENTS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "form",
  "iframe",
  "frame",
  "object",
  "embed",
  "canvas",
  "svg",
  "math",
  "link",
  "meta",
  "img",
  "picture",
  "video",
  "audio",
  "source",
  "track",
]);
const BLOCK_TYPES: Record<string, ExtractedBlockType> = {
  blockquote: "blockquote",
  code: "code",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  li: "list_item",
  p: "paragraph",
  pre: "code",
  title: "title",
  tr: "table_row",
};

type HtmlAttribute = { name: string; value: string };
type HtmlNode = {
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  nodeName: string;
  tagName?: string;
  value?: string;
};

function getAttribute(node: HtmlNode, name: string) {
  return node.attrs?.find((attribute) => attribute.name.toLowerCase() === name)?.value ?? "";
}

function isHidden(node: HtmlNode) {
  const style = getAttribute(node, "style").toLowerCase().replace(/\s+/g, "");
  const classes = `${getAttribute(node, "class")} ${getAttribute(node, "id")}`.toLowerCase();

  return (
    node.attrs?.some((attribute) => attribute.name.toLowerCase() === "hidden") === true ||
    getAttribute(node, "aria-hidden").toLowerCase() === "true" ||
    style.includes("display:none") ||
    style.includes("visibility:hidden") ||
    style.includes("opacity:0") ||
    /\b(?:tracking-pixel|tracker|analytics-pixel)\b/.test(classes)
  );
}

function getNodeText(node: HtmlNode): string {
  if (node.nodeName === "#text") {
    return node.value ?? "";
  }

  const tagName = node.tagName?.toLowerCase();

  if ((tagName && SKIPPED_ELEMENTS.has(tagName)) || isHidden(node)) {
    return "";
  }

  const separator = tagName === "br" || tagName === "td" || tagName === "th" ? "\n" : " ";
  return (node.childNodes ?? []).map(getNodeText).filter(Boolean).join(separator);
}

function decodeHtml(bytes: Uint8Array) {
  const sniff = new TextDecoder("windows-1252").decode(bytes.slice(0, Math.min(bytes.length, 2048)));
  const declaredCharset = /<meta\s+[^>]*charset\s*=\s*["']?\s*([^\s"'/>]+)/i.exec(sniff)?.[1]?.toLowerCase();
  const bomUtf8 = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const charset = bomUtf8 || !declaredCharset ? "utf-8" : declaredCharset;
  const allowedCharsets = new Set(["utf-8", "utf8", "windows-1252", "iso-8859-1", "latin1", "us-ascii"]);

  if (!allowedCharsets.has(charset)) {
    throw new DocumentProcessingError(`HTML uses an unsupported character encoding (${charset}).`, 400);
  }

  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentProcessingError("HTML could not be decoded safely.", 400);
  }
}

function looksLikeHtml(text: string) {
  const sample = text.slice(0, 4096).replace(/^\uFEFF/, "");
  return /<!doctype\s+html|<html\b|<(?:article|main|body|head|title|h[1-6]|p|table|ul|ol|blockquote|pre)\b/i.test(sample);
}

function getElementPath(parentPath: string, tagName: string, siblingIndex: number) {
  return `${parentPath}/${tagName}[${siblingIndex}]`;
}

export function extractHtmlUnits(source: string) {
  if (/<!ENTITY\b|<!DOCTYPE\s+[^>]+\b(?:SYSTEM|PUBLIC)\b/i.test(source)) {
    throw new DocumentProcessingError("HTML contains an unsafe external declaration.", 400);
  }

  const document = parse(source, { scriptingEnabled: false }) as unknown as HtmlNode;
  const units: ExtractedUnit[] = [];
  const headingPath: string[] = [];
  let title = "";

  function visit(node: HtmlNode, parentPath: string, siblingIndex: number) {
    const tagName = node.tagName?.toLowerCase();

    if (!tagName) {
      (node.childNodes ?? []).forEach((child, index) => visit(child, parentPath, index + 1));
      return;
    }

    if (SKIPPED_ELEMENTS.has(tagName) || isHidden(node)) {
      return;
    }

    const path = getElementPath(parentPath, tagName, siblingIndex);
    const blockType = BLOCK_TYPES[tagName];

    if (blockType) {
      let text = normalizeBlockText(getNodeText(node));

      if (blockType === "table_row") {
        text = text
          .split("\n")
          .map((cell) => normalizeExtractedText(cell))
          .filter(Boolean)
          .join(" | ");
      }

      if (text) {
        if (blockType === "title") {
          title = normalizeExtractedText(text);
        } else {
          if (blockType === "heading") {
            const level = Number(tagName.slice(1));
            headingPath.splice(level - 1);
            headingPath[level - 1] = normalizeExtractedText(text);
          }

          units.push({
            blockType,
            codeLanguage: blockType === "code" ? getAttribute(node, "class").replace(/^language-/, "") || undefined : undefined,
            headingPath: headingPath.filter(Boolean),
            locationLabel: blockType === "heading" ? `Heading: ${normalizeExtractedText(text)}` : `HTML: ${path}`,
            sourceLocation: path,
            tableContext: blockType === "table_row" ? "HTML table" : undefined,
            text,
          });
        }
      }

      return;
    }

    (node.childNodes ?? []).forEach((child, index) => visit(child, path, index + 1));
  }

  visit(document, "", 1);
  return { title, units };
}

export const htmlProcessor: DocumentProcessorPlugin = {
  canProcess(input) {
    const filename = input.filename.toLowerCase();
    return (filename.endsWith(".html") || filename.endsWith(".htm")) && HTML_MIME_TYPES.has(input.mimeType);
  },
  extensions: [".html", ".htm"],
  async extract(input) {
    const source = decodeHtml(input.bytes);
    const { title, units } = extractHtmlUnits(source);
    const plainText = normalizeExtractedText(units.map((unit) => unit.text).join("\n\n"));

    if (units.length === 0 || plainText.length < 10 || countWords(plainText) < 2) {
      throw new DocumentProcessingError("HTML does not contain enough safe, readable content.");
    }

    return {
      charCount: plainText.length,
      extractionMethod: "html",
      kind: "html",
      plainText,
      title: title || input.filename,
      units,
      warnings: [],
      wordCount: countWords(plainText),
    };
  },
  id: "html",
  kind: "html",
  label: "HTML",
  maxBytes: MAX_HTML_SIZE_BYTES,
  mimeTypes: Array.from(HTML_MIME_TYPES).filter(Boolean),
  validate(input) {
    const filename = input.filename.toLowerCase();

    if (!filename.endsWith(".html") && !filename.endsWith(".htm")) {
      throw new DocumentProcessingError("Only .html and .htm files are supported by the HTML processor.", 400);
    }

    if (!HTML_MIME_TYPES.has(input.mimeType)) {
      throw new DocumentProcessingError("HTML uploads must use a compatible text/html MIME type.", 400);
    }

    assertMaxBytes(input.bytes, MAX_HTML_SIZE_BYTES, "HTML");
    const source = decodeHtml(input.bytes);

    if (!looksLikeHtml(source)) {
      throw new DocumentProcessingError("This file does not appear to contain HTML.", 400);
    }
  },
};
