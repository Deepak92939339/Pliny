import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRIVATE_BETA_SIGNUP_MESSAGE, PUBLIC_SIGNUP_ENABLED, rejectPublicSignup } from "../src/lib/auth/privateBeta.ts";

const repository = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(repository, path), "utf8");

assert.equal(PUBLIC_SIGNUP_ENABLED, false, "public signup must remain disabled");

for (const values of [
  { email: "synthetic@example.invalid", password: "invented-password" },
  { email: "not-an-email", password: "x" },
]) {
  void values;
  assert.deepEqual(rejectPublicSignup(), {
    status: "error",
    message: PRIVATE_BETA_SIGNUP_MESSAGE,
  });
}

const actions = read("src/lib/auth/actions.ts");
assert.match(actions, /signupWithPassword\(values/);
assert.match(actions, /void values/);
assert.match(actions, /return rejectPublicSignup\(\)/);
assert.doesNotMatch(actions, /auth\.signUp/);

const publicSurfaces = [
  "src/components/auth/AuthView.tsx",
  "src/components/landing/LandingView.tsx",
  "src/components/landing/InfoPage.tsx",
];

for (const path of publicSurfaces) {
  const source = read(path);
  assert.doesNotMatch(source, /href=["{]\/?["']?\/signup/);
  assert.doesNotMatch(source, /Create account|Start workspace/);
}

assert.match(read("src/components/auth/AuthView.tsx"), /private beta/i);
assert.match(read("src/components/auth/PrivateBetaView.tsx"), /Access is by invitation/);
assert.match(read("src/app/signup/page.tsx"), /PrivateBetaView/);

const grantRepair = read("supabase/migrations/20260910120000_revoke_public_match_document_chunks_execute.sql");
assert.match(grantRepair, /revoke all on function public\.match_document_chunks\([^;]+\) from public/i);
assert.match(grantRepair, /revoke execute on function public\.match_document_chunks\([^;]+\) from anon/i);
assert.match(grantRepair, /grant execute on function public\.match_document_chunks\([^;]+\) to authenticated/i);

console.log("Private-beta authentication boundary tests passed.");
