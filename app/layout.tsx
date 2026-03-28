import type { Metadata } from "next";
import "./globals.css";
import { AuthSessionProvider } from "./components/AuthSessionProvider";

export const metadata: Metadata = {
  title: "Amazon FBA Wholesale Sourcing Dashboard",
  description: "Upload wholesale sheets, pull SP-API data, and evaluate Amazon FBA opportunities.",
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
