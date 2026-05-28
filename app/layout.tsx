import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.slashcart.app"),
  title: "SlashCart",
  description: "Compare grocery prices across Amazon and Walmart",
  icons: {
    icon: "/slashcart-logo.svg",
  },
  openGraph: {
    title: "SlashCart — Slash Your Grocery Bill",
    description:
      "Compare grocery prices across Amazon and Walmart instantly. Upload your list or receipt and find the best deals.",
    url: "https://app.slashcart.app",
    siteName: "SlashCart",
    images: [{ url: "/og-image.svg", width: 320, height: 100 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SlashCart — Slash Your Grocery Bill",
    description:
      "Compare grocery prices across Amazon and Walmart instantly.",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
