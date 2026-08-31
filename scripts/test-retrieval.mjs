import assert from "node:assert/strict";
import {
  getMissingRequiredCitationDocumentIds,
  selectDocumentAwareResults,
} from "../src/lib/search/documentCoverage.ts";
import { fuseAndRerankCandidates, normalizeScores } from "../src/lib/search/fusion.ts";

const result = ({ documentId, chunkIndex, content, keywordScore = 1, semanticSimilarity = null }) => ({
  id: `${documentId}-${chunkIndex}`,
  documentId,
  collectionId: "collection",
  content,
  filename: `${documentId}.pdf`,
  pageNumber: chunkIndex + 1,
  chunkIndex,
  keywordScore,
  relevanceScore: semanticSimilarity ?? keywordScore,
  retrievalMode: semanticSimilarity === null ? "keyword" : keywordScore > 0 ? "hybrid" : "semantic",
  semanticSimilarity,
});

const claude = "The long-document workflow preserves context by processing bounded source passages before synthesis.";
const csv = "The expense table records Cloud at 42000 and Sales at 17000 for the comparison.";

const starvedGlobalTopK = selectDocumentAwareResults(
  [
    ...Array.from({ length: 5 }, (_, index) =>
      result({ documentId: "claude", chunkIndex: index, content: `${claude} Section ${index}.`, keywordScore: 10 - index })
    ),
    result({ documentId: "csv", chunkIndex: 0, content: csv, keywordScore: 4 }),
  ],
  ["claude", "csv"],
  5
);
assert.deepEqual(new Set(starvedGlobalTopK.results.map((item) => item.documentId)), new Set(["claude", "csv"]));
assert.equal(starvedGlobalTopK.missingRequiredDocumentIds.length, 0, "global top-k must not starve an explicitly required document");

const explicitSynthesis = selectDocumentAwareResults(
  [
    result({ documentId: "claude", chunkIndex: 0, content: claude, keywordScore: 7 }),
    result({ documentId: "csv", chunkIndex: 0, content: csv, keywordScore: 6 }),
  ],
  ["claude", "csv"],
  2
);
assert.equal(explicitSynthesis.results.length, 2);
assert.equal(explicitSynthesis.missingRequiredDocumentIds.length, 0, "explicit two-document synthesis must retain both qualifying documents");

const inadequateSecondDocument = selectDocumentAwareResults(
  [
    result({ documentId: "claude", chunkIndex: 0, content: claude, keywordScore: 7 }),
    result({
      documentId: "csv",
      chunkIndex: 0,
      content: "This unrelated passage contains enough characters but no supporting facts for the question.",
      keywordScore: 0,
      semanticSimilarity: 0.21,
    }),
  ],
  ["claude", "csv"],
  2
);
assert.deepEqual(inadequateSecondDocument.missingRequiredDocumentIds, ["csv"], "a required document without adequate evidence must be reported missing");

const ordinarySingleDocument = selectDocumentAwareResults(
  [result({ documentId: "claude", chunkIndex: 0, content: claude, keywordScore: 5 })],
  ["claude"],
  5
);
assert.deepEqual(ordinarySingleDocument.results.map((item) => item.documentId), ["claude"]);
assert.equal(ordinarySingleDocument.missingRequiredDocumentIds.length, 0, "ordinary single-document retrieval must not force unrelated documents");

const irrelevantSelectedDocuments = selectDocumentAwareResults(
  [
    result({
      documentId: "claude",
      chunkIndex: 0,
      content: "An unrelated passage about office opening hours and contact details.",
      keywordScore: 0,
      semanticSimilarity: 0.18,
    }),
    result({
      documentId: "csv",
      chunkIndex: 0,
      content: "An unrelated passage about office opening hours and contact details.",
      keywordScore: 0,
      semanticSimilarity: 0.17,
    }),
  ],
  ["claude", "csv"],
  5
);
assert.deepEqual(irrelevantSelectedDocuments.results, []);
assert.deepEqual(new Set(irrelevantSelectedDocuments.missingRequiredDocumentIds), new Set(["claude", "csv"]));

assert.deepEqual(getMissingRequiredCitationDocumentIds(["claude"], ["claude", "csv"]), ["csv"]);
assert.deepEqual(getMissingRequiredCitationDocumentIds(["claude", "csv"], ["claude", "csv"]), []);

assert.deepEqual(normalizeScores([2, 6, null]), [0, 1, 0]);
const lexicalExact = result({ documentId: "errors", chunkIndex: 0, content: "Error E-42 requires a retry.", keywordScore: 0.9 });
const semanticParaphrase = result({ documentId: "concept", chunkIndex: 0, content: "Bounded source passages preserve long-document context.", keywordScore: 0, semanticSimilarity: 0.94 });
const fused = fuseAndRerankCandidates({ keywordResults: [lexicalExact], semanticResults: [semanticParaphrase], query: "Explain E-42 and long document context", limit: 5 });
assert.deepEqual(new Set(fused.map((item) => item.documentId)), new Set(["errors", "concept"]));
assert.equal(fused.every((item) => item.fusionScore !== undefined), true);

const migration = await (await import("node:fs/promises")).readFile(new URL("../supabase/migrations/20260831090000_pliny_v1_1_ingestion_retrieval_hardening.sql", import.meta.url), "utf8");
assert.equal(migration.includes("security invoker"), true);
assert.equal(migration.includes("match_user_id = (select auth.uid())"), true);
assert.equal(migration.includes("revoke all on function public.match_document_chunks_lexical"), true);
assert.equal(migration.includes("grant execute on function public.match_document_chunks_lexical"), true);

console.log("Document-aware retrieval and lexical fusion tests passed.");
