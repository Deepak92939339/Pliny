import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { buildSyntheticDocxFixture, buildSyntheticPdfFixture } from "./fixtures/synthetic-files.mjs";
import { getRecentChatMessages } from "@/lib/chat/queries";
import { buildCitedAnswerReport } from "@/lib/export/reportExport";

const baseUrl = process.env.PLINY_LOCAL_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertLocalUrl(value, name) {
  assert.ok(value, `${name} must be configured.`);
  const hostname = new URL(value).hostname;
  assert.ok(hostname === "127.0.0.1" || hostname === "localhost", `${name} must point to local infrastructure.`);
}

assertLocalUrl(baseUrl, "PLINY_LOCAL_BASE_URL");
assertLocalUrl(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
assert.ok(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured.");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY must be configured.");
assert.equal(process.env.EMBEDDINGS_ENABLED, "false", "The local E2E suite must not call an embedding provider.");
assert.equal(process.env.ANTHROPIC_API_KEY ?? "", "", "The local E2E suite must not call an answer provider.");
assert.ok((process.env.PRIVACY_PSEUDONYM_KEY ?? "").length >= 32, "PRIVACY_PSEUDONYM_KEY must be configured for privacy-minimised testing.");

const cookieValues = new Map();
const userClient = createServerClient(supabaseUrl, anonKey, {
  cookies: {
    getAll() {
      return Array.from(cookieValues, ([name, value]) => ({ name, value }));
    },
    setAll(cookies) {
      for (const { name, value } of cookies) {
        cookieValues.set(name, value);
      }
    },
  },
});
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const testSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const email = `pliny-local-e2e-${testSuffix}@example.test`;
const password = "Synthetic-local-E2E-2026!";
let userId;
const storagePaths = [];

function cookieHeader() {
  return Array.from(cookieValues, ([name, value]) => `${name}=${value}`).join("; ");
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", cookieHeader());
  return fetch(new URL(path, baseUrl), { ...init, headers });
}

async function requestJson(path, init = {}) {
  const response = await request(path, init);
  const body = await response.json().catch(() => null);
  return { body, response };
}

async function createCollection(name, processingMode = "standard") {
  const { data, error } = await userClient
    .from("collections")
    .insert({ default_processing_mode: processingMode, name, user_id: userId })
    .select("id")
    .single();

  assert.ifError(error);
  assert.ok(data?.id, "The synthetic collection must be created.");
  return data.id;
}

async function uploadDocument(collectionId, { bytes, filename, mimeType }) {
  const formData = new FormData();
  formData.set("collection_id", collectionId);
  formData.set("file", new Blob([bytes], { type: mimeType }), filename);
  const { body, response } = await requestJson("/api/documents/upload", { method: "POST", body: formData });

  assert.equal(response.status, 200, `Upload of ${filename} must succeed: ${body?.error ?? "unknown error"}`);
  assert.ok(body?.document?.id, `Upload of ${filename} must return a document id.`);
  return body.document.id;
}

async function processDocument(documentId) {
  const { body, response } = await requestJson("/api/process-document", {
    body: JSON.stringify({ document_id: documentId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.equal(response.status, 200, `Document processing must succeed: ${body?.error ?? "unknown error"}`);
  assert.equal(body?.status, "ready", "Processed documents must become ready.");
}

async function search(collectionId, query, documentIds) {
  const { body, response } = await requestJson("/api/search-chunks", {
    body: JSON.stringify({ collection_id: collectionId, document_ids: documentIds, query }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.equal(response.status, 200, `Search must succeed: ${body?.error ?? "unknown error"}`);
  return body;
}

function searchText(result) {
  return result.results.map((entry) => entry.content).join("\n");
}

async function collectStoragePaths() {
  const { data, error } = await userClient.from("documents").select("storage_path").eq("user_id", userId);
  assert.ifError(error);
  return (data ?? []).map((document) => document.storage_path).filter(Boolean);
}

async function cleanup() {
  if (!userId) return;

  try {
    const paths = storagePaths.length > 0 ? storagePaths : await collectStoragePaths();
    if (paths.length > 0) {
      const { error } = await userClient.storage.from("documents").remove(paths);
      assert.ifError(error);
    }
  } finally {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    assert.ifError(error);
  }
}

try {
  const { data, error } = await userClient.auth.signUp({ email, password });
  assert.ifError(error);
  assert.ok(data.user?.id, "The synthetic user must be created.");
  assert.ok(data.session, "Local authentication must issue a synthetic session.");
  userId = data.user.id;

  const standardCollectionId = await createCollection(`Synthetic local E2E ${testSuffix}`);
  const textDocumentId = await uploadDocument(standardCollectionId, {
    bytes: Buffer.from(
      "Cedar Operations employs 148 people. Amara Patel is the CTO. The FY2026 payroll is 4.2 million dollars."
    ),
    filename: "cedar-operations.txt",
    mimeType: "text/plain",
  });
  const pdfDocumentId = await uploadDocument(standardCollectionId, {
    bytes: buildSyntheticPdfFixture(),
    filename: "synthetic-calibration.pdf",
    mimeType: "application/pdf",
  });
  const docxDocumentId = await uploadDocument(standardCollectionId, {
    bytes: buildSyntheticDocxFixture(),
    filename: "synthetic-brief.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await processDocument(textDocumentId);
  await processDocument(pdfDocumentId);
  await processDocument(docxDocumentId);
  storagePaths.push(...(await collectStoragePaths()));

  const titleSearch = await search(standardCollectionId, "Who is the CTO?");
  assert.match(searchText(titleSearch), /Amara Patel/, "Lexical retrieval must return the direct job-role fact.");
  const headcountSearch = await search(standardCollectionId, "How many people work at Cedar Operations?");
  assert.match(searchText(headcountSearch), /148 people/, "Lexical retrieval must return the direct headcount fact.");
  const scopedSearch = await search(standardCollectionId, "What is the payroll?", [textDocumentId]);
  assert.match(searchText(scopedSearch), /4\.2 million dollars/, "Document-scoped retrieval must retain the requested fact.");
  assert.ok(
    scopedSearch.results.every((entry) => entry.documentId === textDocumentId),
    "Document-scoped retrieval must not return another document's passages."
  );

  const { body: invalidPdfBody, response: invalidPdfResponse } = await requestJson("/api/documents/upload", {
    body: (() => {
      const formData = new FormData();
      formData.set("collection_id", standardCollectionId);
      formData.set("file", new Blob(["not a PDF"], { type: "application/pdf" }), "invalid.pdf");
      return formData;
    })(),
    method: "POST",
  });
  assert.equal(invalidPdfResponse.status, 400, "Non-PDF bytes labeled as PDFs must be rejected before parsing.");
  assert.equal(
    invalidPdfBody?.error,
    "This file could not be validated safely. Try a supported file.",
    "Malformed PDF errors must remain user-safe and actionable."
  );
  const parseablePdfBytes = buildSyntheticPdfFixture();
  const { body: truncatedPdfBody, response: truncatedPdfResponse } = await requestJson("/api/documents/upload", {
    body: (() => {
      const formData = new FormData();
      formData.set("collection_id", standardCollectionId);
      formData.set(
        "file",
        new Blob([parseablePdfBytes.subarray(0, Math.floor(parseablePdfBytes.length / 2))], { type: "application/pdf" }),
        "truncated.pdf"
      );
      return formData;
    })(),
    method: "POST",
  });
  assert.equal(truncatedPdfResponse.status, 422, "Truncated PDFs must be rejected after PDF parsing fails.");
  assert.equal(
    truncatedPdfBody?.error,
    "This file could not be validated safely. Try a supported file.",
    "Truncated PDF errors must remain user-safe and actionable."
  );

  const privacyCollectionId = await createCollection(`Synthetic privacy E2E ${testSuffix}`, "privacy_minimised");
  const privacyDocumentId = await uploadDocument(privacyCollectionId, {
    bytes: Buffer.from("Elena Example manages bank account number 123456789012. Contact elena@example.test for the reconciliation."),
    filename: "privacy-account.txt",
    mimeType: "text/plain",
  });
  await processDocument(privacyDocumentId);
  storagePaths.push(...(await collectStoragePaths()));

  const { data: privacyChunks, error: privacyChunksError } = await userClient
    .from("document_chunks")
    .select("content,embedding_projection,provider_safe_content")
    .eq("document_id", privacyDocumentId);
  assert.ifError(privacyChunksError);
  assert.ok(privacyChunks?.length, "Privacy-minimised ingestion must create chunks.");
  assert.ok(
    privacyChunks.every(
      (chunk) =>
        chunk.embedding_projection === "privacy_minimised" &&
        !chunk.provider_safe_content?.includes("elena@example.test") &&
        !chunk.provider_safe_content?.includes("123456789012")
    ),
    "Privacy-minimised chunks must redact deterministic identifiers before provider processing."
  );
  const privacySearch = await search(privacyCollectionId, "Which bank account needs reconciliation?");
  assert.equal(privacySearch.results[0]?.processingMode, "privacy_minimised", "Search must preserve the privacy mode boundary.");

  const { body: inventoryAnswer, response: inventoryResponse } = await requestJson("/api/chat", {
    body: JSON.stringify({ collection_id: standardCollectionId, message: "What documents are uploaded?" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(inventoryResponse.status, 200, "Document inventory answers must not require a provider.");
  assert.equal(inventoryAnswer?.status, "answered", "Document inventory answers must be saved as answered chat responses.");
  const report = buildCitedAnswerReport({ result: inventoryAnswer, workspaceName: "Synthetic local E2E" });
  assert.equal(report.title, "Answer Report", "Uncited deterministic answers must not be labeled as cited reports.");

  const { body: unsupportedAnswer, response: unsupportedResponse } = await requestJson("/api/chat", {
    body: JSON.stringify({ collection_id: standardCollectionId, message: "What is the office parking policy?" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(unsupportedResponse.status, 200, "Unsupported questions must return a safe response before provider generation.");
  assert.equal(unsupportedAnswer?.status, "insufficient_evidence", "Unsupported questions must retain the evidence refusal.");
  assert.deepEqual(unsupportedAnswer?.citations, [], "Unsupported questions must not emit unsupported citations.");

  const history = await getRecentChatMessages({ collectionId: standardCollectionId, supabase: userClient, userId });
  assert.equal(history.error, null, "Saved chat history must load through the database-backed history query.");
  assert.ok(history.messages.length >= 2, "Chat history must include deterministic and insufficient-evidence responses.");
  const collectionPage = await request(`/collection/${standardCollectionId}`);
  assert.equal(collectionPage.status, 200, "The database-backed workspace page must render for the authenticated synthetic user.");

  console.log("Local database-backed E2E validation passed.");
} finally {
  await cleanup();
}
