import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthSessionProvider } from "./components/AuthSessionProvider";

const defaultTitle = "Amazon FBA Wholesale Sourcing Dashboard";
const siteTitle = process.env.NEXT_PUBLIC_APP_TITLE?.trim() || defaultTitle;

export const metadata: Metadata = {
  title: siteTitle,
  description: "Upload wholesale sheets, pull SP-API data, and evaluate Amazon FBA opportunities.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
