import { csvProcessor } from "@/lib/document-processing/plugins/csv";
import { docxProcessor } from "@/lib/document-processing/plugins/docx";
import { htmlProcessor } from "@/lib/document-processing/plugins/html";
import { markdownProcessor } from "@/lib/document-processing/plugins/markdown";
import { pdfProcessor } from "@/lib/document-processing/plugins/pdf";
import { textProcessor } from "@/lib/document-processing/plugins/text";
import { xlsxProcessor } from "@/lib/document-processing/plugins/xlsx";
import { getFileExtension, inferSupportedFileKind } from "@/lib/document-processing/fileKinds";
import type { DocumentProcessorInput, DocumentProcessorPlugin, SupportedFileKind } from "@/lib/document-processing/types";

export const documentProcessorPlugins: DocumentProcessorPlugin[] = [
  pdfProcessor,
  docxProcessor,
  xlsxProcessor,
  htmlProcessor,
  markdownProcessor,
  textProcessor,
  csvProcessor,
];

export const supportedFileExtensions = Array.from(new Set(documentProcessorPlugins.flatMap((plugin) => plugin.extensions))).sort();
export const supportedMimeTypes = Array.from(new Set(documentProcessorPlugins.flatMap((plugin) => plugin.mimeTypes))).sort();
export const supportedFileKinds = Array.from(new Set(documentProcessorPlugins.map((plugin) => plugin.kind))) as SupportedFileKind[];

export function getProcessorForFile(input: DocumentProcessorInput) {
  return documentProcessorPlugins.find((plugin) => plugin.canProcess(input)) ?? null;
}

export const getDocumentProcessor = getProcessorForFile;

export function getFileKindFromNameOrMime(input: { filename: string; mimeType: string }) {
  const extensionKind = inferSupportedFileKind(input.filename);

  if (extensionKind !== "unknown") {
    return extensionKind;
  }

  const plugin = documentProcessorPlugins.find((candidate) => candidate.mimeTypes.includes(input.mimeType));

  return plugin?.kind ?? "unknown";
}

export function getProcessorForExtension(filename: string) {
  const extension = getFileExtension(filename);

  return documentProcessorPlugins.find((plugin) => plugin.extensions.includes(extension)) ?? null;
}
