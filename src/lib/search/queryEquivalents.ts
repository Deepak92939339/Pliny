export type KnownRoleConcept = "chief_technology_officer";

const CTO_TOKEN = /\bcto\b/i;
const CTO_PHRASE = /\bchief\s+technology\s+officer\b/i;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function getKnownRoleConcepts(value: string): KnownRoleConcept[] {
  return CTO_TOKEN.test(value) || CTO_PHRASE.test(value) ? ["chief_technology_officer"] : [];
}

export function expandKnownRoleTerms(value: string) {
  const additions: string[] = [];

  if (CTO_TOKEN.test(value) && !CTO_PHRASE.test(value)) additions.push("chief technology officer");
  if (CTO_PHRASE.test(value) && !CTO_TOKEN.test(value)) additions.push("cto");

  return additions.length > 0 ? `${value} ${additions.join(" ")}` : value;
}

export function contentMatchesKnownRoleConcept(value: string, concept: KnownRoleConcept) {
  if (concept !== "chief_technology_officer") return false;
  const normalized = normalize(value);
  return /\bcto\b/.test(normalized) || normalized.includes("chief technology officer");
}
