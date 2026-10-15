import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Crede — Verified Professional Identity",
  description: "Maintain your career timeline once. Generate recruiter-ready CVs forever.",
  icons: {
    icon: [
      { url: "/icons/logo-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/logo-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/logo-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/icons/logo-128.png", sizes: "128x128", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
