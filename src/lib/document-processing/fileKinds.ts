import type { SupportedFileKind } from "@/lib/document-processing/types";

const EXTENSION_TO_KIND = new Map<string, SupportedFileKind>([
  [".pdf", "pdf"],
  [".docx", "docx"],
  [".xlsx", "xlsx"],
  // WP7 (audit-r1): the legacy ".xls" → "xlsx" mapping is removed — the
  // client already rejects .xls and docs/limitations.md documents it as
  // unsupported. A direct server upload now gets 415 via
  // getUnsupportedFileRejection.
  [".csv", "csv"],
  [".html", "html"],
  [".htm", "html"],
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".txt", "text"],
]);

/**
 * WP7 (audit-r1): aligned rejection payloads for files that are recognised as
 * unsupported before the generic "unsupported file type" answer. null means
 * the file is handled by the normal path.
 */
export function getUnsupportedFileRejection(filename: string): { status: number; error: string } | null {
  const extension = getFileExtension(filename);

  if (extension === ".xls") {
    // Same message the client uses for .xls.
    return { status: 415, error: "Legacy .xls files are not supported." };
  }

  if (extension === ".xlsm") {
    return { status: 400, error: "Macro-enabled spreadsheets are not supported. Upload an .xlsx or CSV file instead." };
  }

  return null;
}

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
