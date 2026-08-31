import { estimateTokens } from "../chunker.ts";
import { MAX_DOCUMENT_CHUNKS } from "./limits.ts";
import { DocumentProcessingError, normalizeExtractedText, type DocumentProcessingMetadata, type ExtractedDocument, type ExtractedUnit } from "./types.ts";

const DEFAULT_TARGET_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;
const TOKEN_ESTIMATE_PER_WORD = 1.3;

export type ExtractedDocumentChunk = {
  chunkIndex: number;
  content: string;
  estimatedTokens: number;
  fileKind: ExtractedDocument["kind"];
  locationLabel: string;
  metadata: DocumentProcessingMetadata;
  pageNumber: number;
};

type ChunkExtractedDocumentOptions = {
  maxChunks?: number;
  overlapTokens?: number;
  targetTokens?: number;
};

function getWords(text: string) {
  return normalizeExtractedText(text).split(" ").filter(Boolean);
}

function buildUnitMetadata(document: ExtractedDocument, unit: ExtractedUnit, unitIndex: number): DocumentProcessingMetadata {
  return {
    ...(unit.metadata ?? {}),
    cellIndex: unit.cellIndex ?? null,
    blockType: unit.blockType ?? "text",
    codeLanguage: unit.codeLanguage ?? null,
    extractionMethod: document.extractionMethod,
    fileKind: document.kind,
    headingPath: unit.headingPath?.join(" > ") ?? null,
    lineEnd: unit.lineEnd ?? null,
    lineStart: unit.lineStart ?? null,
    locationLabel: unit.locationLabel,
    pageNumber: unit.pageNumber ?? null,
    rowEnd: unit.rowEnd ?? null,
    rowStart: unit.rowStart ?? null,
    sheetName: unit.sheetName ?? null,
    slideNumber: unit.slideNumber ?? null,
    sourceLocation: unit.sourceLocation ?? unit.locationLabel,
    tableContext: unit.tableContext ?? null,
    unitIndex,
  };
}

export function chunkExtractedDocument(document: ExtractedDocument, options: ChunkExtractedDocumentOptions = {}) {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const maxChunks = options.maxChunks ?? MAX_DOCUMENT_CHUNKS;
  const targetWords = Math.max(1, Math.floor(targetTokens / TOKEN_ESTIMATE_PER_WORD));
  const overlapWords = Math.max(0, Math.floor(overlapTokens / TOKEN_ESTIMATE_PER_WORD));
  const stepWords = Math.max(1, targetWords - overlapWords);
  const chunks: ExtractedDocumentChunk[] = [];

  document.units.forEach((unit, unitIndex) => {
    const words = getWords(unit.text);
    const pageNumber = unit.pageNumber ?? 1;
    const metadata = buildUnitMetadata(document, unit, unitIndex);

    for (let start = 0; start < words.length; start += stepWords) {
      const slice = words.slice(start, start + targetWords);

      if (slice.length === 0) {
        continue;
      }

      if (chunks.length >= maxChunks) {
        throw new DocumentProcessingError(`This document exceeds the supported ${maxChunks}-chunk indexing limit.`, 413);
      }

      chunks.push({
        chunkIndex: chunks.length,
        content: slice.join(" "),
        estimatedTokens: estimateTokens(slice.length),
        fileKind: document.kind,
        locationLabel: unit.locationLabel,
        metadata: {
          ...metadata,
          chunkPart: Math.floor(start / stepWords) + 1,
        },
        pageNumber,
      });

      if (start + targetWords >= words.length) {
        break;
      }
    }
  });

  return chunks;
}
