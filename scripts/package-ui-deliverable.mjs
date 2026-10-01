import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

export function isSafeArtifactPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return !normalized.split("/").some((part) => part.startsWith(".env") || [".git", ".vercel", ".supabase", ".temp", ".next", "node_modules", "artifacts", "deliverables"].includes(part))
    && !/credentials|storageState|\.pem$|\.key$/i.test(normalized)
    && !normalized.endsWith("PROJECT_STATE.md") && !normalized.startsWith("docs/release/");
}

if (process.argv.includes("--build")) {
  const root = resolve(import.meta.dirname, "..");
  const stage = mkdtempSync(resolve(tmpdir(), "pliny-reviewed-package-"));
  const destination = resolve(root, "deliverables/pliny-ui-REVIEWED.zip");
  if (existsSync(destination)) throw new Error("Refusing to append to an existing ZIP; move the previous reviewed archive aside first.");
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean).filter(isSafeArtifactPath);
  for (const file of tracked) {
    const target = resolve(stage, "pliny", file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(root, file), target);
  }
  writeFileSync(resolve(stage, "REVIEWED.patch"), execFileSync("git", ["format-patch", "--stdout", "da124a4..HEAD", "--", ".", ":!PROJECT_STATE.md", ":!docs/release/"], { cwd: root }));
  mkdirSync(dirname(destination), { recursive: true });
  execFileSync("zip", ["-qr", destination, "."], { cwd: stage });
  const entries = execFileSync("unzip", ["-Z1", destination], { encoding: "utf8" }).split("\n").filter(Boolean);
  if (entries.some((entry) => !isSafeArtifactPath(entry))) throw new Error("Unsafe path found in deliverable archive.");
  console.log(`Sanitized archive generated (${entries.length} entries). Historical pliny-ui-FINAL.zip is NOT approved.`);
}
