import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: "16mb",
  },
  async headers() {
    // WP4 (audit-r1, PLN-002): the enforced, nonce-based Content-Security-Policy
    // is set per-request in src/middleware.ts (it needs the request nonce, so
    // it cannot live in these static headers). The old Report-Only CSP is
    // removed; all other headers are unchanged.
    return [
      {
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
        source: "/:path*",
      },
    ];
  },
  serverExternalPackages: ["pdf-parse", "tesseract.js", "tesseract.js-core", "@napi-rs/canvas", "@tesseract.js-data/eng"],
  // WP1: make sure the OCR language data and native binaries are traced into
  // the serverless bundle for the process-document route, so OCR cannot fail
  // from a missing asset at runtime.
  outputFileTracingIncludes: {
    "/api/process-document": [
      "./node_modules/@tesseract.js-data/eng/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/@napi-rs/canvas/**",
    ],
  },
};

export default nextConfig;
