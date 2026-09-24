import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSafeRedirect, isSafeLocalRedirect, resolveAppOrigin } from "../src/lib/auth/redirects.ts";

const repository = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(repository, path), "utf8");
const headers = (values) => ({
  get(name) {
    return values[name.toLowerCase()] ?? null;
  },
});

// Post-authentication navigation must remain on the current origin.
assert.equal(isSafeLocalRedirect("/dashboard"), true);
assert.equal(isSafeLocalRedirect("/collection/abc?x=1"), true);
assert.equal(isSafeLocalRedirect("/"), true);
assert.equal(isSafeLocalRedirect("//evil.example"), false);
assert.equal(isSafeLocalRedirect("/\\evil.example"), false);
assert.equal(isSafeLocalRedirect("https://evil.example"), false);
assert.equal(isSafeLocalRedirect("javascript:alert(1)"), false);
assert.equal(isSafeLocalRedirect(" /dashboard"), false);
assert.equal(isSafeLocalRedirect("/dashboard\n"), false);
assert.equal(isSafeLocalRedirect(`/${"a".repeat(2048)}`), false);
assert.equal(getSafeRedirect("//evil.example", "/dashboard"), "/dashboard");
assert.equal(getSafeRedirect(null, "/login"), "/login");
assert.equal(getSafeRedirect("/dashboard", "/login"), "/dashboard");

assert.equal(resolveAppOrigin(headers({ origin: "https://pliny.example" })), "https://pliny.example");
assert.equal(resolveAppOrigin(headers({ origin: "https://pliny.example/path" })), "");
assert.equal(
  resolveAppOrigin(headers({ "x-forwarded-host": "pliny.example", "x-forwarded-proto": "https" })),
  "https://pliny.example"
);
assert.equal(resolveAppOrigin(headers({ host: "127.0.0.1:3100", "x-forwarded-proto": "http" })), "http://127.0.0.1:3100");
assert.equal(resolveAppOrigin(headers({ host: "evil.example/path" })), "");

const actions = read("src/lib/auth/actions.ts");
assert.match(actions, /signInWithPassword\(/);
assert.match(actions, /auth\.signUp\(/);
assert.match(actions, /signupFormSchema\.safeParse\(values\)/);
assert.match(actions, /signInWithOAuth\(/);
assert.match(actions, /resetPasswordForEmail\(/);
assert.match(actions, /auth\.updateUser\(/);
assert.match(actions, /emailRedirectTo/);
assert.match(actions, /redirectTo: origin \? `\$\{origin\}\/auth\/confirm`/);
assert.match(actions, /auth\.getUser\(\)/);
assert.match(actions, /redirectUrl: data\.url/);
assert.doesNotMatch(actions, /redirect\(data\.url\)/);
assert.doesNotMatch(actions, /service_role/i);
assert.doesNotMatch(actions, /rejectPublicSignup/);

const callbackRoute = read("src/app/auth/callback/route.ts");
assert.match(callbackRoute, /exchangeCodeForSession\(/);
assert.match(callbackRoute, /getSafeRedirect\(/);
assert.doesNotMatch(callbackRoute, /error_description/);

const confirmRoute = read("src/app/auth/confirm/route.ts");
assert.match(confirmRoute, /verifyOtp\(/);
assert.match(confirmRoute, /token_hash/);
assert.match(confirmRoute, /type === "recovery" \? "\/auth\/reset-password" : "\/dashboard"/);
assert.doesNotMatch(confirmRoute, /console\.log\([\s\S]{0,120}tokenHash/);

const confirmationTemplate = read("supabase/templates/confirmation.html");
assert.match(confirmationTemplate, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&amp;type=email/);
assert.doesNotMatch(confirmationTemplate, /\.ConfirmationURL/);

const recoveryTemplate = read("supabase/templates/recovery.html");
assert.match(recoveryTemplate, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/);
assert.doesNotMatch(recoveryTemplate, /\.ConfirmationURL/);

const supabaseConfig = read("supabase/config.toml");
assert.match(supabaseConfig, /\[auth\.email\][\s\S]*?enable_confirmations = true/);
assert.match(supabaseConfig, /minimum_password_length = 8/);
assert.match(supabaseConfig, /\[auth\.email\.template\.confirmation\]/);
assert.match(supabaseConfig, /\[auth\.email\.template\.recovery\]/);

const authView = read("src/components/auth/AuthView.tsx");
assert.match(authView, /loginWithPassword/);
assert.match(authView, /signupWithPassword/);
assert.match(authView, /requestPasswordReset/);
assert.match(authView, /const result = await signInWithGoogle\(\)/);
assert.match(authView, /if \(result\.status === "error"\)/);
assert.match(authView, /window\.location\.assign\(result\.redirectUrl\)/);
assert.match(authView, /href="\/signup"/);
assert.doesNotMatch(authView, /NO EMAIL IS SENT/);
assert.doesNotMatch(authView, /REQUESTS ARE NOT COLLECTED/);
assert.doesNotMatch(authView, /private beta/i);

const resetView = read("src/components/auth/ResetPasswordView.tsx");
assert.match(resetView, /updateAccountPassword/);
assert.match(resetView, /updatePasswordFormSchema/);

const signupPage = read("src/app/signup/page.tsx");
assert.match(signupPage, /AuthView/);
assert.match(signupPage, /mode="signup"/);

const landing = read("src/components/landing/LandingView.tsx");
assert.match(landing, /href="\/signup"/);
assert.match(landing, /Create account/);
assert.doesNotMatch(landing, /Request access/);

assert.equal(existsSync(resolve(repository, "src/lib/auth/privateBeta.ts")), false);
assert.equal(existsSync(resolve(repository, "src/components/auth/PrivateBetaView.tsx")), false);

// Database ownership remains the authorization boundary after authentication changes.
const grantRepair = read("supabase/migrations/20260910120000_revoke_public_match_document_chunks_execute.sql");
assert.match(grantRepair, /revoke all on function public.match_document_chunks([^;]+) from public/i);
assert.match(grantRepair, /revoke execute on function public.match_document_chunks([^;]+) from anon/i);
assert.match(grantRepair, /grant execute on function public.match_document_chunks([^;]+) to authenticated/i);

console.log("Authentication boundary tests passed.");
