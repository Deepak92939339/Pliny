import { access } from "node:fs/promises";

const sourceRoot = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const relativePath = specifier.slice(2);
  const candidates = [
    new URL(`${relativePath}.ts`, sourceRoot),
    new URL(`${relativePath}.tsx`, sourceRoot),
    new URL(`${relativePath}/index.ts`, sourceRoot),
    new URL(`${relativePath}/index.tsx`, sourceRoot),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return nextResolve(candidate.href, context);
    } catch {
      // Try the next TypeScript path candidate.
    }
  }

  return nextResolve(specifier, context);
}
