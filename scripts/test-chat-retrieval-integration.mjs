import assert from "node:assert/strict";
import { assessEvidenceSufficiency } from "../src/lib/ai/evidenceSufficiency.ts";
import { retrieveRelevantChunks } from "../src/lib/search/retrieveChunks.ts";

process.env.EMBEDDINGS_ENABLED = "false";

const collectionId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const chunk = {
  chunk_index: 0,
  collection_id: collectionId,
  content:
    "This is fictional test data. Aster Quill serves as Chief Technology Officer of ExampleCo Test. ExampleCo Test recorded Q3 revenue of $4.27M and gross margin of 68.4%.",
  document_id: documentId,
  file_kind: "pdf",
  id: "44444444-4444-4444-8444-444444444444",
  lexical_rank: 0.8,
  location_label: "Page 1",
  metadata: {},
  page_number: 1,
  processing_mode: "standard",
  provider_safe_content: null,
  provider_safe_metadata: null,
};

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.selection = "";
  }

  select(selection) {
    this.selection = selection;
    return this;
  }

  eq() {
    return this;
  }

  in() {
    return this;
  }

  limit() {
    return this;
  }

  order() {
    return this;
  }

  result() {
    if (this.table === "documents" && this.selection === "id,processing_mode") {
      return { data: [{ id: documentId, processing_mode: "standard" }], error: null };
    }

    if (this.table === "documents" && this.selection === "id,filename") {
      return { data: [{ filename: "This is fictional test data..pdf", id: documentId }], error: null };
    }

    if (this.table === "document_chunks") {
      return {
        data: [
          {
            ...chunk,
            documents: {
              filename: "This is fictional test data..pdf",
              processing_mode: "standard",
              status: "ready",
            },
          },
        ],
        error: null,
      };
    }

    throw new Error(`Unexpected query against ${this.table}: ${this.selection}`);
  }

  then(resolve, reject) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

function createSupabaseWitness() {
  const lexicalQueries = [];

  return {
    client: {
      from(table) {
        return new QueryBuilder(table);
      },
      async rpc(name, args) {
        assert.equal(name, "match_document_chunks_lexical_by_mode");
        lexicalQueries.push(args.match_query);
        const normalizedContent = chunk.content.toLowerCase();
        const matchesLexically = args.match_query
          .split(" ")
          .filter(Boolean)
          .every((term) => normalizedContent.includes(term));
        return { data: matchesLexically ? [chunk] : [], error: null };
      },
    },
    lexicalQueries,
  };
}

async function runChatRetrievalPipeline(question) {
  const witness = createSupabaseWitness();
  const retrieval = await retrieveRelevantChunks(witness.client, {
    collectionId,
    limit: 4,
    query: question,
    userId,
  });
  const evidence = assessEvidenceSufficiency({
    question,
    retrievalReason: retrieval.retrievalReason,
    sources: retrieval.results,
  });

  return { evidence, retrieval, witness };
}

const acronym = await runChatRetrievalPipeline("Who is the CTO?");
assert.deepEqual(acronym.witness.lexicalQueries, ["cto", "chief technology officer"]);
assert.equal(acronym.retrieval.retrievalReason, "direct_keyword_match");
assert.equal(acronym.retrieval.results.length, 1);
assert.match(acronym.retrieval.results[0].content, /Aster Quill serves as Chief Technology Officer/);
assert.equal(acronym.evidence.sufficient, true);

const expanded = await runChatRetrievalPipeline("Who serves as the Chief Technology Officer?");
assert.deepEqual(expanded.witness.lexicalQueries, ["serves cto", "serves chief technology officer"]);
assert.equal(expanded.retrieval.retrievalReason, "direct_keyword_match");
assert.equal(expanded.evidence.sufficient, true);

const unrelatedAcronym = await runChatRetrievalPipeline("Who is the CFO?");
assert.deepEqual(unrelatedAcronym.witness.lexicalQueries, ["Who is the CFO?"]);
assert.equal(unrelatedAcronym.retrieval.retrievalReason, "broad_context_fallback");
assert.equal(unrelatedAcronym.evidence.sufficient, false);

const october = await runChatRetrievalPipeline("What happened in October?");
assert.deepEqual(october.witness.lexicalQueries, ["What happened in October?"]);
assert.equal(october.retrieval.retrievalReason, "broad_context_fallback");
assert.equal(october.evidence.sufficient, false);

console.log("Chat retrieval route-pipeline integration tests passed.");
