import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Virtual Gravity AI Sales Engine",
    default: "Virtual Gravity AI Sales Engine",
  },
  description:
    "AI-powered sales system for real estate companies. Capture, qualify, and convert leads with intelligent automation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
