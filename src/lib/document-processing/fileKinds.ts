import type { SupportedFileKind } from "@/lib/document-processing/types";

const EXTENSION_TO_KIND = new Map<string, SupportedFileKind>([
  [".pdf", "pdf"],
  [".docx", "docx"],
  [".xlsx", "xlsx"],
  [".xls", "xlsx"],
  [".csv", "csv"],
  [".html", "html"],
  [".htm", "html"],
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".txt", "text"],
]);

export function getFileExtension(filename: string) {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  const dotIndex = lastSegment.lastIndexOf(".");

  if (dotIndex < 0) {
    return "";
  }

  return lastSegment.slice(dotIndex).toLowerCase();
}

export function inferSupportedFileKind(filename: string): SupportedFileKind {
  return EXTENSION_TO_KIND.get(getFileExtension(filename)) ?? "unknown";
}

export function getFileKindLabel(kind: SupportedFileKind) {
  const labels: Record<SupportedFileKind, string> = {
    csv: "CSV",
    docx: "DOCX",
    html: "HTML",
    markdown: "MD",
    pdf: "PDF",
    text: "TXT",
    unknown: "FILE",
    xlsx: "XLSX",
  };

  return labels[kind];
}
