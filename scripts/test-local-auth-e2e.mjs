import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const appBaseUrl = process.env.PLINY_LOCAL_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mailboxUrl = process.env.PLINY_LOCAL_SMTP_URL ?? "http://127.0.0.1:55424";

function assertLocalUrl(value, name) {
  assert.ok(value, `${name} must be configured.`);
  const hostname = new URL(value).hostname;
  assert.ok(hostname === "127.0.0.1" || hostname === "localhost", `${name} must point to local infrastructure.`);
}

assertLocalUrl(appBaseUrl, "PLINY_LOCAL_BASE_URL");
assertLocalUrl(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
assertLocalUrl(mailboxUrl, "PLINY_LOCAL_SMTP_URL");
assert.ok(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured.");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY must be configured for local cleanup.");

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const publicClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const email = `pliny-auth-e2e-${suffix}@example.test`;
const originalPassword = "Synthetic-auth-E2E-2026!";
const replacementPassword = "Synthetic-auth-E2E-2026-updated!";
let userId;

function pause(milliseconds) {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

async function readMailboxMessage(subjectFragment) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const listResponse = await fetch(new URL("/api/v1/messages", mailboxUrl));
    assert.equal(listResponse.ok, true, `Local mailbox list failed with HTTP ${listResponse.status}.`);
    const list = await listResponse.json();
    const summary = (list.messages ?? []).find((message) => {
      const recipients = Array.isArray(message.To) ? message.To : [];
      return recipients.some((recipient) => recipient.Address === email) && message.Subject?.includes(subjectFragment);
    });
    if (summary?.ID) {
      const messageResponse = await fetch(new URL(`/api/v1/message/${summary.ID}`, mailboxUrl));
      assert.equal(messageResponse.ok, true, `Local mailbox message failed with HTTP ${messageResponse.status}.`);
      return messageResponse.json();
    }
    await pause(250);
  }
  assert.fail(`Timed out waiting for local email containing subject: ${subjectFragment}`);
}

function extractApplicationLink(message) {
  const body = `${message.HTML ?? ""}\n${message.Text ?? ""}`.replaceAll("&amp;", "&");
  const links = body.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const link = links.find((candidate) => {
    try {
      const parsed = new URL(candidate);
      return parsed.origin === new URL(appBaseUrl).origin && parsed.pathname === "/auth/confirm";
    } catch {
      return false;
    }
  });
  assert.ok(link, "The local auth email must contain an /auth/confirm application link.");
  return link;
}

function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1) };
  });
}

function clientFromCookies(initialCookies) {
  const values = new Map(initialCookies.map(({ name, value }) => [name, value]));
  return createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return Array.from(values, ([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const { name, value } of cookies) values.set(name, value);
      },
    },
  });
}

async function followAuthEmail(link, expectedPath) {
  const response = await fetch(link, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(response.status), `Auth confirmation returned HTTP ${response.status}.`);
  const location = response.headers.get("location");
  assert.ok(location, "Auth confirmation must redirect after verifying the token.");
  assert.equal(new URL(location, appBaseUrl).pathname, expectedPath);
  const cookies = responseCookies(response);
  assert.ok(cookies.length > 0, "Auth confirmation must write an SSR session cookie.");
  return cookies;
}

try {
  const { data: signup, error: signupError } = await publicClient.auth.signUp({
    email,
    password: originalPassword,
    options: { emailRedirectTo: `${appBaseUrl}/auth/confirm` },
  });
  assert.ifError(signupError);
  assert.ok(signup.user?.id, "Signup must create an unconfirmed local user.");
  assert.equal(signup.session, null, "Email-confirmation signup must not issue a session before verification.");
  userId = signup.user.id;

  const confirmationMessage = await readMailboxMessage("Confirm your Pliny account");
  const confirmationCookies = await followAuthEmail(extractApplicationLink(confirmationMessage), "/dashboard");
  const confirmedClient = clientFromCookies(confirmationCookies);
  const { data: confirmedIdentity, error: confirmedIdentityError } = await confirmedClient.auth.getUser();
  assert.ifError(confirmedIdentityError);
  assert.equal(confirmedIdentity.user?.email, email, "Confirmation must establish the intended user session.");

  const { error: recoveryError } = await publicClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${appBaseUrl}/auth/confirm`,
  });
  assert.ifError(recoveryError);
  const recoveryMessage = await readMailboxMessage("Reset your Pliny password");
  const recoveryCookies = await followAuthEmail(extractApplicationLink(recoveryMessage), "/auth/reset-password");
  const recoveryClient = clientFromCookies(recoveryCookies);
  const { data: recoveryIdentity, error: recoveryIdentityError } = await recoveryClient.auth.getUser();
  assert.ifError(recoveryIdentityError);
  assert.equal(recoveryIdentity.user?.email, email, "Recovery verification must establish the intended user session.");

  const { error: updateError } = await recoveryClient.auth.updateUser({ password: replacementPassword });
  assert.ifError(updateError);
  const verificationClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signedIn, error: signInError } = await verificationClient.auth.signInWithPassword({
    email,
    password: replacementPassword,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session, "The replacement password must authenticate successfully.");

  console.log("Local signup, confirmation, recovery, and password-update E2E passed.");
} finally {
  if (userId) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    assert.ifError(error);
  }
}
