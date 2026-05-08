import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appDisplayName } from "@/lib/appBranding";
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

/**
 * Inline script that runs synchronously before the first browser paint.
 * Sets all CSS variables and html attributes from localStorage so there is
 * ZERO flash of unstyled content when the saved theme differs from the
 * CSS :root defaults.  Must stay in sync with lib/theme.ts.
 */
const themeInitScript = `(function(){try{
  var T={
    teal:   {a:'20 184 166', h:'45 212 191', a2:'6 182 212',   g:'linear-gradient(135deg,rgb(20 184 166)0%,rgb(6 182 212)100%)',   gl:'rgb(20 184 166/0.3)',  r:'20 184 166',  st:'10 26 28', sm:'13 32 35', bb:'12 12 15', be:'16 16 20', m:'dark'},
    blue:   {a:'37 99 235',  h:'96 165 250', a2:'79 70 229',   g:'linear-gradient(135deg,rgb(37 99 235)0%,rgb(79 70 229)100%)',    gl:'rgb(37 99 235/0.3)',   r:'37 99 235',   st:'11 14 38', sm:'14 18 48', bb:'12 12 15', be:'16 16 20', m:'dark'},
    violet: {a:'124 58 237', h:'167 139 250',a2:'147 51 234',  g:'linear-gradient(135deg,rgb(124 58 237)0%,rgb(147 51 234)100%)',  gl:'rgb(124 58 237/0.3)',  r:'124 58 237',  st:'18 11 38', sm:'24 14 48', bb:'12 12 15', be:'16 16 20', m:'dark'},
    slate:  {a:'71 85 105',  h:'100 116 139',a2:'51 65 85',    g:'linear-gradient(135deg,rgb(71 85 105)0%,rgb(100 116 139)100%)',  gl:'rgb(71 85 105/0.25)',  r:'100 116 139', st:'16 18 22', sm:'20 22 28', bb:'11 11 14', be:'15 15 19', m:'dark'},
    amber:  {a:'217 119 6',  h:'251 191 36', a2:'180 83 9',    g:'linear-gradient(135deg,rgb(217 119 6)0%,rgb(180 83 9)100%)',     gl:'rgb(217 119 6/0.3)',   r:'217 119 6',   st:'30 18 8',  sm:'38 22 10', bb:'12 12 15', be:'16 16 20', m:'dark'},
    rose:   {a:'225 29 72',  h:'251 113 133',a2:'190 18 60',   g:'linear-gradient(135deg,rgb(225 29 72)0%,rgb(190 18 60)100%)',    gl:'rgb(225 29 72/0.3)',   r:'225 29 72',   st:'34 11 16', sm:'42 14 20', bb:'12 12 15', be:'16 16 20', m:'dark'},
    emerald:{a:'5 150 105',  h:'52 211 153', a2:'13 148 136',  g:'linear-gradient(135deg,rgb(5 150 105)0%,rgb(13 148 136)100%)',   gl:'rgb(5 150 105/0.3)',   r:'5 150 105',   st:'10 28 18', sm:'12 36 22', bb:'12 12 15', be:'16 16 20', m:'dark'},
    light:  {a:'14 165 233', h:'56 189 248', a2:'6 182 212',   g:'linear-gradient(135deg,rgb(14 165 233)0%,rgb(6 182 212)100%)',   gl:'rgb(14 165 233/0.3)',  r:'14 165 233',  st:'10 26 28', sm:'13 32 35', bb:'12 12 15', be:'16 16 20', m:'light'}
  };
  var id=localStorage.getItem('hf-accent-theme')||'teal';
  var t=T[id]||T.teal;
  var d=document.documentElement;
  d.style.setProperty('--accent',t.a);
  d.style.setProperty('--accent-hover',t.h);
  d.style.setProperty('--accent-2',t.a2);
  d.style.setProperty('--border-accent',t.a);
  d.style.setProperty('--gradient-accent',t.g);
  d.style.setProperty('--shadow-glow','0 0 20px -5px '+t.gl);
  d.style.setProperty('--accent-muted',t.a+' / 0.15');
  d.style.setProperty('--row-selected',t.r);
  d.style.setProperty('--bg-sidebar-top',t.st);
  d.style.setProperty('--bg-sidebar-mid',t.sm);
  d.style.setProperty('--bg-body-base',t.bb);
  d.style.setProperty('--bg-body-elevated',t.be);
  var mode=localStorage.getItem('hf-app-mode')||t.m;
  if(mode==='light')d.setAttribute('data-mode','light');
  var den=localStorage.getItem('hf-table-density');
  if(den)d.setAttribute('data-density',den);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/*
         * Raw synchronous inline script — first element in <body>.
         * The browser executes this before parsing any body content,
         * so the first paint always uses the correct theme colors.
         * Using a raw <script> (not next/script) guarantees it is
         * never async/deferred by the framework.
         */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <PwaRegister />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
