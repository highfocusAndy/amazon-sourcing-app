import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appDisplayName, appShortName } from "@/lib/appBranding";
import { AuthSessionProvider } from "./components/AuthSessionProvider";
import { PwaRegister } from "./components/PwaRegister";
import { publicSiteOrigin } from "@/lib/publicSiteUrl";

const defaultTitle = "HIGH FOCUS Sourcing App — Amazon wholesale & FBA research";
const siteTitle = process.env.NEXT_PUBLIC_APP_TITLE?.trim() || defaultTitle;

const siteDescription =
  "HIGH FOCUS Sourcing App: research Amazon wholesale lists, catalog & keyword search, offers, and FBA opportunity analysis. Sign in to connect your seller account.";

export const metadata: Metadata = {
  metadataBase: publicSiteOrigin(),
  applicationName: "HIGH FOCUS Sourcing App",
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    type: "website",
    siteName: appDisplayName,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
