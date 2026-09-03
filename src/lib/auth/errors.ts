type AuthIntent = "login" | "signup";

export type AuthProviderError = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
};

function normalizedField(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getAuthErrorMessage(error: AuthProviderError, intent: AuthIntent) {
  const code = normalizedField(error.code);
  const message = normalizedField(error.message);

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }

  if (code === "user_already_exists" || message.includes("user already registered")) {
    return "An account already exists for this email. Sign in instead.";
  }

  if (code === "signup_disabled" || message.includes("signups not allowed")) {
    return "Account creation is not available right now.";
  }

  if (code.includes("rate_limit") || error.status === 429) {
    return "Too many attempts. Wait a moment and try again.";
  }

  if (code === "weak_password" || message.includes("password should be")) {
    return "Choose a stronger password and try again.";
  }

  return intent === "login"
    ? "Unable to sign in right now. Please try again."
    : "Unable to create the account right now. Please try again.";
}

export function getSafeAuthErrorMetadata(error: AuthProviderError) {
  const code = normalizedField(error.code);
  const name = normalizedField(error.name);

  return {
    code: /^[a-z0-9_-]{1,80}$/.test(code) ? code : "unknown",
    name: /^[a-z0-9_-]{1,80}$/.test(name) ? name : "auth_error",
    status: typeof error.status === "number" && Number.isInteger(error.status) ? error.status : null,
  };
}
