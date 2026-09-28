import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Variable names --font-newsreader / --font-ibm-plex are historical and intentionally preserved (other files reference them directly).
const newsreader = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
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

export const metadata: Metadata = {
  title: {
    default: "Pliny",
    template: "%s · Pliny",
  },
  description: "Knowledge, traced to its source.",
  openGraph: {
    title: "Pliny — Knowledge, traced to its source.",
    description: "Evidence-grounded document intelligence with source-backed answers and visible citations.",
    siteName: "Pliny",
    type: "website",
  },
  icons: {
    icon: [{ url: "/brand/pliny-monogram.svg?v=20260921", sizes: "any", type: "image/svg+xml" }],
    shortcut: "/brand/pliny-monogram.svg?v=20260921",
  },
  manifest: "/site.webmanifest",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // WP4 (audit-r1, PLN-002): reading the middleware-set nonce here makes Next
  // stamp its bootstrap scripts with the same nonce and opts routes into
  // dynamic rendering so the nonce is always per-request fresh.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${ibmPlexSans.variable} ${jetBrainsMono.variable} theme-soft-fade font-sans antialiased`}
      nonce={nonce}
    >
      <body>{children}</body>
    </html>
  );
}
