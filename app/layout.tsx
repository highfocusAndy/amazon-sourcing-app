import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon FBA Wholesale Sourcing Dashboard",
  description: "Upload wholesale sheets, pull SP-API data, and evaluate Amazon FBA opportunities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
