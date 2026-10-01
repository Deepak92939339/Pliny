/**
 * WP4 (audit-r1): enforced Content-Security-Policy builder.
 *
 * PLN-002 (S2): the app previously shipped only a Report-Only CSP with
 * 'unsafe-inline' 'unsafe-eval' script sources. The middleware now builds an
 * enforced, per-request nonce policy with this pure function.
 *
 * Directive decisions:
 * - script-src: 'self' + per-request nonce + 'strict-dynamic' (spec pattern).
 *   'self' and host sources are legacy fallbacks that strict-dynamic-aware
 *   browsers ignore; older browsers still get 'self'.
 * - style-src 'self' 'unsafe-inline': required by Tailwind/CSS-module runtime
 *   style injection and React style attributes. Acceptable per spec.
 * - connect-src: 'self' plus the Supabase project URL (REST/auth) and its
 *   wss: equivalent (realtime). Answer/embedding providers are called
 *   server-side only and are intentionally NOT reachable from the browser.
 * - img-src allows data: and blob: (canvas/PDF previews).
 * - font-src 'self' data: (next/font self-hosts Geist).
 */
export type CspOptions = {
  nonce: string;
  supabaseUrl?: string | null;
  isDevelopment: boolean;
};

function getSupabaseConnectSources(supabaseUrl?: string | null): string[] {
  if (!supabaseUrl || !/^https:\/\//i.test(supabaseUrl)) {
    return [];
  }

  try {
    const parsed = new URL(supabaseUrl);
    const host = parsed.host;
    return [`https://${host}`, `wss://${host}`];
  } catch {
    return [];
  }
}

export function buildEnforcedCsp({ isDevelopment, nonce, supabaseUrl }: CspOptions): string {
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    // Tailwind / CSS-module runtime injection and React style attributes need
    // inline styles; scripts are nonce-locked above.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${getSupabaseConnectSources(supabaseUrl).join(" ")}`.trim(),
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  return directives.join("; ");
}
