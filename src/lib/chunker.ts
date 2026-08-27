const DEFAULT_TARGET_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;
const DEFAULT_MAX_CHUNKS = 200;
const TOKEN_ESTIMATE_PER_WORD = 1.3;

export type PageText = {
  pageNumber: number;
  text: string;
};

export type TextChunk = {
  content: string;
  pageNumber: number;
  chunkIndex: number;
  estimatedTokens: number;
};

type ChunkOptions = {
  maxChunks?: number;
  overlapTokens?: number;
  targetTokens?: number;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getWords(text: string) {
  return normalizeText(text).split(" ").filter(Boolean);
}

export function estimateTokens(wordCount: number) {
  return Math.ceil(wordCount * TOKEN_ESTIMATE_PER_WORD);
}

export function chunkDocumentPages(pages: PageText[], options: ChunkOptions = {}): TextChunk[] {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const targetWords = Math.max(1, Math.floor(targetTokens / TOKEN_ESTIMATE_PER_WORD));
  const overlapWords = Math.max(0, Math.floor(overlapTokens / TOKEN_ESTIMATE_PER_WORD));
  const stepWords = Math.max(1, targetWords - overlapWords);
  const chunks: TextChunk[] = [];

  for (const page of pages) {
    const words = getWords(page.text);

    if (words.length === 0) {
      continue;
    }

    for (let start = 0; start < words.length && chunks.length < maxChunks; start += stepWords) {
      const slice = words.slice(start, start + targetWords);

      if (slice.length === 0) {
        continue;
      }

      chunks.push({
        content: slice.join(" "),
        pageNumber: page.pageNumber,
        chunkIndex: chunks.length,
        estimatedTokens: estimateTokens(slice.length),
      });

      if (start + targetWords >= words.length) {
        break;
      }
    }

    if (chunks.length >= maxChunks) {
      break;
    }
  }

  return chunks;
}
