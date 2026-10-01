/**
 * WP4 — SECURITY HEADERS, COOKIES, DEPENDENCIES (spec: PLINY FIX R1, WP4)
 *
 * Unit coverage for the pure CSP builder used by the middleware. The enforced
 * Content-Security-Policy must be nonce-based and strict-dynamic in
 * production, may relax to 'unsafe-eval' only in development, must pin the
 * Supabase project URL (+ wss) into connect-src, and must never advertise
 * 'unsafe-inline' for scripts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const cspModule = await import("../src/lib/security/csp.ts").catch((error) => ({ __importError: error }));

const { buildEnforcedCsp } = cspModule;

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

const SUPABASE_URL = "https://abcdefgh.supabase.co";

await run("production CSP: nonce-based, strict-dynamic, no unsafe-eval/unsafe-inline for scripts", () => {
  assert.equal(typeof buildEnforcedCsp, "function", "buildEnforcedCsp does not exist yet");
  const csp = buildEnforcedCsp({ nonce: "abc123", supabaseUrl: SUPABASE_URL, isDevelopment: false });
  assert.ok(csp.includes("'nonce-abc123'"), csp);
  assert.ok(csp.includes("'strict-dynamic'"), csp);
  assert.ok(!csp.includes("'unsafe-eval'"), `production must not allow unsafe-eval: ${csp}`);
  const scriptDirective = csp.split("; ").find((directive) => directive.startsWith("script-src"));
  assert.ok(!scriptDirective.includes("'unsafe-inline'"), `scripts must not allow unsafe-inline: ${scriptDirective}`);
});

await run("development CSP: unsafe-eval allowed for the dev overlay", () => {
  assert.equal(typeof buildEnforcedCsp, "function", "buildEnforcedCsp does not exist yet");
  const csp = buildEnforcedCsp({ nonce: "abc123", supabaseUrl: SUPABASE_URL, isDevelopment: true });
  const scriptDirective = csp.split("; ").find((directive) => directive.startsWith("script-src"));
  assert.ok(scriptDirective.includes("'unsafe-eval'"), scriptDirective);
});

await run("CSP pins the Supabase project URL and its wss equivalent into connect-src", () => {
  assert.equal(typeof buildEnforcedCsp, "function", "buildEnforcedCsp does not exist yet");
  const csp = buildEnforcedCsp({ nonce: "abc123", supabaseUrl: SUPABASE_URL, isDevelopment: false });
  const connectDirective = csp.split("; ").find((directive) => directive.startsWith("connect-src"));
  assert.ok(connectDirective.includes(SUPABASE_URL), connectDirective);
  assert.ok(connectDirective.includes("wss://abcdefgh.supabase.co"), connectDirective);
});

await run("CSP hardening directives are present", () => {
  assert.equal(typeof buildEnforcedCsp, "function", "buildEnforcedCsp does not exist yet");
  const csp = buildEnforcedCsp({ nonce: "abc123", supabaseUrl: SUPABASE_URL, isDevelopment: false });
  assert.ok(csp.includes("frame-ancestors 'none'"), csp);
  assert.ok(csp.includes("base-uri 'self'"), csp);
  assert.ok(csp.includes("form-action 'self'"), csp);
  assert.ok(csp.includes("object-src 'none'"), csp);
  assert.ok(csp.startsWith("default-src 'self'"), csp);
});

await run("middleware forwards the same nonce CSP to Next rendering and the browser", async () => {
  const exports = {};
  let forwarded;
  const code = ts.transpileModule(readFileSync("src/middleware.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports, Headers, crypto: { randomUUID: () => "test-nonce" },
    process: { env: { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL } },
    require: (name) => {
      if (name === "@/lib/security/csp") return { buildEnforcedCsp };
      if (name === "@/lib/supabase/middleware") return { updateSession: async (_request, headers) => { forwarded = headers; return { headers: new Headers() }; } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const response = await exports.middleware({ headers: new Headers() });
  assert.equal(forwarded.get("x-nonce"), "test-nonce");
  assert.equal(forwarded.get("Content-Security-Policy"), response.headers.get("Content-Security-Policy"));
  assert.ok(forwarded.get("Content-Security-Policy").includes("'nonce-test-nonce'"));
  assert.doesNotMatch(readFileSync("src/app/layout.tsx", "utf8"), /nonce=\{nonce\}/);
});

const failures = results.filter((result) => result.status === "FAIL");
console.log("\n=== WP4 security header tests ===");
for (const result of results) {
  console.log(`${result.status === "PASS" ? "PASS" : "FAIL"}  ${result.name}${result.status === "FAIL" ? `\n      -> ${result.detail}` : ""}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length > 0 ? 1 : 0);
