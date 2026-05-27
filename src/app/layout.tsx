import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import { MapPin } from "lucide-react";
import "./globals.css";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE, DEFAULT_OG_IMAGE } from "@/lib/seo";

// Viewport + theme color live as a separate export in Next 14+ (warning if mixed with metadata).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0a0a0a',
};

const inter = Inter({ subsets: ["latin"] });

// Site-wide metadata defaults. Page-level metadata via pageMeta() in src/lib/seo.ts
// overrides per route. URL is env-driven (NEXT_PUBLIC_SITE_URL) so a custom domain swap
// later doesn't need code changes.
const SITE_TITLE = "HIMOTHY PLAYS AND PARLAYS | Daily Picks & Parlays";
const SITE_DESCRIPTION = "Daily sports picks, parlays, and edges — moneylines, spreads, totals, props across NBA, NFL, MLB, NHL, WNBA, soccer, tennis, UFC, and golf. Real plays. Real reasons. Verified record from day one.";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "sports betting", "sports picks today", "parlays", "free picks", "best picks today",
    "HIMOTHY", "HIMOTHY plays and parlays",
    "NBA picks", "NFL picks", "MLB picks", "NHL picks", "WNBA picks",
    "college football picks", "college baseball picks", "UFC picks", "tennis picks",
    "$10 parlay", "best parlay picks", "moneyline picks", "spread picks", "over under picks",
    "player props", "alt prop lines", "ATS picks",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: "/logo-badge.png",
    shortcut: "/logo-badge.png",
    apple: "/logo-badge.png",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // Search engine ownership verification. Google reads <meta name="google-site-verification">
  // on the root page. Add Bing's token in the same `other` block when you set it up too.
  verification: {
    google: 'KdiSceBuKBgU1YRC7_dgtD_BvANOL6lc6KujV3YYatw',
    // other: { 'bing-site-verification': 'paste-bing-token-here' },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Performance: preconnect to APIs we hit on every page so the TCP+TLS handshake
            overlaps with the HTML parse instead of stacking on top of it. Cuts LCP by
            100-200ms on cold loads. */}
        <link rel="preconnect" href="https://site.api.espn.com" crossOrigin="" />
        <link rel="preconnect" href="https://api.the-odds-api.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://site.api.espn.com" />
        <link rel="dns-prefetch" href="https://api.the-odds-api.com" />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-background text-foreground flex flex-col">
          {/* State-Aware Disclaimer Banner Mock */}
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-center flex items-center justify-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
            <p className="text-[10px] md:text-xs font-bold text-yellow-500/80 uppercase tracking-widest">
              Florida Users: Hard Rock Bet is the legal sportsbook. Ensure you meet all age & jurisdiction requirements before placing wagers.
            </p>
          </div>
          
          {children}

          {/* Global 21+ Disclaimer Footer */}
          <footer className="bg-card border-t border-border mt-auto py-8 text-center text-xs text-muted-foreground z-10 relative">
            <div className="max-w-4xl mx-auto px-6 space-y-4">
              <div className="flex flex-col items-center gap-3 mb-2">
                <Image src="/logo-badge.png" alt="HIMOTHY PLAYS AND PARLAYS" width={64} height={64} className="rounded-full border border-primary/40" />
                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-primary">HIMOTHY PLAYS AND PARLAYS</span>
                <span className="w-10 h-10 rounded-full border-2 border-muted-foreground flex items-center justify-center font-black text-sm text-muted-foreground opacity-50">21+</span>
              </div>
              <p className="font-bold opacity-70">RESPONSIBLE GAMING WARNING</p>
              <p className="opacity-60 leading-relaxed max-w-2xl mx-auto">
                Must be 21+ to wager. If you or someone you know has a gambling problem and wants help, call 1-800-GAMBLER. Sports betting involves substantial risk and is not suitable for all investors. All information on HIMOTHY is provided for entertainment purposes. Lines and odds subject to change without notice.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
