export const PUBLIC_SIGNUP_ENABLED = false;

export const PRIVATE_BETA_SIGNUP_MESSAGE =
  "Pliny is currently a private beta. Access is limited to administrator-created accounts.";

export function rejectPublicSignup() {
  return {
    status: "error" as const,
    message: PRIVATE_BETA_SIGNUP_MESSAGE,
  };
}
