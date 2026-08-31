import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
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
    icon: [
      { url: "/brand/pliny-mark-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/pliny-mark-48.png", sizes: "48x48", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${newsreader.variable} ${ibmPlexSans.variable} ${jetBrainsMono.variable} theme-soft-fade font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
