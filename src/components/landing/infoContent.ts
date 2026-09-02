export type LandingInfoKey = "security" | "privacy" | "file-support" | "access" | "about";

export type LandingInfoPage = {
  key: LandingInfoKey;
  label: string;
  href: `/${LandingInfoKey}`;
  title: string;
  summary: string[];
  detail: string[];
};

export const landingInfoPages: LandingInfoPage[] = [
  {
    key: "security",
    label: "Trust & Security",
    href: "/security",
    title: "Security follows the source.",
    summary: [
      "Documents live in a private Supabase Storage bucket.",
      "Authenticated access is scoped to the owner’s workspaces.",
      "PostgreSQL RLS remains enabled on exposed data tables.",
      "Citations are validated against retrieved source passages.",
    ],
    detail: [
      "Pliny keeps uploaded documents in a private Supabase Storage bucket and checks the authenticated user before workspace and document access.",
      "Database policies use the signed in owner identity to scope collections, documents, chunks and answers. Retrieval stays within the selected owner scoped collection.",
      "Answers are source grounded and citation validation runs before supported responses are shown. When the retrieved material is insufficient, Pliny can say so rather than inventing support.",
      "Supabase documents encryption at rest and in transit for its platform. Pliny does not claim compliance certification or enterprise security controls that are not implemented.",
    ],
  },
  {
    key: "privacy",
    label: "Data Privacy",
    href: "/privacy",
    title: "Keep the source material close.",
    summary: [
      "Uploaded files, extracted chunks, embeddings and provenance are stored in private workspaces.",
      "Standard mode can send original document passages and questions to configured providers; privacy-minimised mode masks supported structured identifiers first.",
      "Provider zero retention is being evaluated; no automatic retention window is claimed.",
      "Privacy minimisation is not anonymisation: names, addresses, organisations and unsupported identifiers may remain.",
    ],
    detail: [
      "Pliny stores uploaded objects in private Supabase Storage, along with extracted chunks, embeddings, provenance metadata, collection records, chat messages and usage records needed by the deployed workspace.",
      "Each workspace has a default for new documents, and each document captures an immutable standard or privacy-minimised processing mode. Changing the workspace default does not reprocess existing documents.",
      "In standard mode, document passages are used for embeddings and the original question and retrieved context may be sent to the configured generation provider. In privacy-minimised mode, supported structured identifiers are replaced with document-scoped typed pseudonyms before embedding or generation requests. Original evidence remains available only through the owner-scoped workspace.",
      "The existing workspace deletion path controls removal of collections and their related application records. This release does not claim an automatic retention window, provider zero retention or a promise that data is never used for training.",
      "Privacy-minimised exports stay masked by default and reversible reconstruction is disabled. Deterministic detection does not currently claim complete coverage of names, addresses, organisations or multilingual identifiers. Google Drive and OneDrive integrations are planned and are not available in this release.",
    ],
  },
  {
    key: "file-support",
    label: "Supported Formats",
    href: "/file-support",
    title: "Bring the files you already use.",
    summary: [
      "PDF, DOCX, XLSX, CSV, TXT, Markdown and HTML are supported.",
      "Uploads are bounded by the deployed request and processing limits.",
      "Searchable PDF text is preferred, with OCR fallback only at the configured boundary.",
      "HTML and Markdown are parsed as untrusted source material.",
    ],
    detail: [
      "The deployed ingestion pipeline supports PDF, DOCX, XLSX, CSV, TXT, Markdown and HTML files. Legacy .xls and macro enabled .xlsm uploads are rejected.",
      "PDF processing prefers native searchable text and uses OCR fallback only where the configured low text boundary requires it. Page, heading, sheet and stable block locations remain available for citations.",
      "Markdown preserves useful headings, lists, tables, code blocks and section context. HTML is parsed without executing active content and unsafe or hidden content is removed before indexing.",
      "The upload path applies a 15 MB client limit plus server and processing ceilings. A document that exceeds a supported boundary fails safely instead of becoming partially ready.",
    ],
  },
  {
    key: "access",
    label: "Access & Usage",
    href: "/access",
    title: "Access is currently authenticated.",
    summary: [
      "Pliny is currently available for authenticated workspace use.",
      "AI usage is limited by the configured request and budget guards.",
      "The answer and embedding providers are configured server side.",
      "Access and usage limits may change as the release is evaluated.",
    ],
    detail: [
      "Pliny is currently available for authenticated workspace use. Access is subject to the application’s configured request and budget guards.",
      "Answer generation and embedding providers are configured on the server. The browser does not receive provider credentials.",
      "This page describes the current release behavior; access and usage limits may change as the product is evaluated.",
    ],
  },
  {
    key: "about",
    label: "About Pliny",
    href: "/about",
    title: "Made for careful reading.",
    summary: [
      "Evidence-grounded document intelligence for searchable collections.",
      "Semantic and lexical retrieval keep citations close to source passages.",
      "Supported document processing includes charts and reports where evidence allows.",
      "Structured provenance, responsive UI and careful QA support review.",
    ],
    detail: [
      "Pliny is evidence-grounded document intelligence for searchable document collections. It combines semantic and lexical retrieval, citations, source inspection and supported document processing, with charts and reports where they are grounded in evidence.",
      "The product includes ingestion with structured provenance, citation and evidence validation, private owner-scoped workspaces, a responsive production UI, and automated and browser QA. The name references Pliny the Elder quietly, as inspiration for collecting and organizing knowledge.",
      "Built by Deepak Patro",
      "Pliny is designed and built by Deepak Patro, an independent developer focused on evidence-grounded document systems, workflow reliability and carefully verified AI-assisted engineering.",
      "Pliny is not presented as a fully supported enterprise platform. Feedback and thoughtful review are welcome through the project repository.",
    ],
  },
];

export function getLandingInfoPage(key: LandingInfoKey) {
  return landingInfoPages.find((page) => page.key === key) as LandingInfoPage;
}
