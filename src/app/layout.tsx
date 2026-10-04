import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Variable names --font-newsreader / --font-ibm-plex are historical and intentionally preserved (other files reference them directly).
const newsreader = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const ibmPlexSans = Inter({
  subsets: ["latin"],
  variable: "--font-ibm-plex",
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// WP9 (audit-r1, K.6): canonical URL + social preview images. Set
// NEXT_PUBLIC_SITE_URL to the production origin (custom domain) in Vercel;
// it falls back to the deployed Vercel URL here.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://pliny.vercel.app";
const socialPreview = "/pliny-social-preview-1280x640.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Pliny",
    template: "%s · Pliny",
  },
  description: "Knowledge, traced to its source.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Pliny — Knowledge, traced to its source.",
    description: "Evidence-grounded document intelligence with source-backed answers and visible citations.",
    siteName: "Pliny",
    type: "website",
    url: "/",
    images: [
      {
        url: socialPreview,
        width: 1280,
        height: 640,
        alt: "Pliny — evidence-grounded document intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [socialPreview],
  },
  icons: {
    icon: [{ url: "/brand/pliny-tab.svg?v=20261004", sizes: "any", type: "image/svg+xml" }],
    shortcut: "/brand/pliny-tab.svg?v=20261004",
  },
  manifest: "/site.webmanifest",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opt into per-request rendering. Next extracts script nonces from the CSP
  // request header forwarded by middleware; nonce is not an HTML-root attribute.
  await headers();

  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${ibmPlexSans.variable} ${jetBrainsMono.variable} theme-soft-fade font-sans antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
