export const PROCESSING_BOUNDARY_TITLE = "How your data is processed";

export const PROCESSING_BOUNDARY_PARAGRAPHS = [
  "Standard processing may send document text and questions to configured embedding and answer providers. Privacy-minimised processing masks supported identifiers before external processing, but detection may not catch every sensitive value. Provider zero-retention is not verified for this deployment. Do not upload regulated or highly sensitive information.",
  "Privacy-minimised does not mean local-only processing.",
] as const;
