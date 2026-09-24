type HeaderReader = {
  get(name: string): string | null;
};

const UNSAFE_REDIRECT_CHARS = /[\s\\\x00-\x1f]/;

export function isSafeLocalRedirect(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  if (value.length === 0 || value.length > 2048 || value !== value.trim()) {
    return false;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }
  if (value.startsWith("/\\")) {
    return false;
  }
  if (UNSAFE_REDIRECT_CHARS.test(value)) {
    return false;
  }
  return true;
}

export function getSafeRedirect(value: string | null | undefined, fallback: string): string {
  return isSafeLocalRedirect(value) ? value : fallback;
}

export function resolveAppOrigin(headerStore: HeaderReader): string {
  const origin = headerStore.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      ) {
        return url.origin;
      }
    } catch {
      // Fall through to the deployment proxy headers.
    }
  }
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? headerStore.get("host");
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  if (host && /^[\w.-]+(?::\d+)?$/.test(host)) {
    return `${proto}://${host}`;
  }
  return "";
}
