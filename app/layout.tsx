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
  description: "Paste your grocery list or upload a receipt — we find the best unit price across Amazon and Walmart and build your cart automatically.",
  icons: {
    icon: "/slashcart-logo.svg",
  },
  openGraph: {
    title: "SlashCart — Slash Your Grocery Bill",
    description:
      "Paste your grocery list or upload a receipt — we find the best unit price across Amazon and Walmart and build your cart automatically.",
    url: "https://app.slashcart.app",
    siteName: "SlashCart",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SlashCart — Slash Your Grocery Bill",
    description:
      "Paste your grocery list or upload a receipt — we find the best unit price across Amazon and Walmart and build your cart automatically.",
    images: ["/og-image.png"],
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
