import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MapPin } from "lucide-react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "HIMOTHY | Professional Sports Intelligence",
    template: "%s | HIMOTHY"
  },
  description: "HIMOTHY is the leading sports research and performance intelligence platform. Powered by a continuous decision engine and roster-verified audit systems.",
  keywords: ["sports betting", "parlays", "HIMOTHY", "sports research", "betting tools", "NBA picks", "NFL picks", "live decision engine"],
  authors: [{ name: "HIMOTHY Team" }],
  creator: "HIMOTHY",
  metadataBase: new URL("https://himothy.com"), // Placeholder domain
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://himothy.com",
    title: "HIMOTHY | Professional Sports Intelligence",
    description: "HIMOTHY is the leading sports research and performance intelligence platform.",
    siteName: "HIMOTHY",
    images: [
      {
        url: "/logo.jpg",
        width: 1200,
        height: 630,
        alt: "HIMOTHY Sports Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HIMOTHY | Professional Sports Intelligence",
    description: "HIMOTHY is the leading sports research and performance intelligence platform.",
    images: ["/logo.jpg"],
    creator: "@himothy",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
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
              <div className="flex justify-center mb-2">
                <span className="w-12 h-12 rounded-full border-2 border-muted-foreground flex items-center justify-center font-black text-xl text-muted-foreground opacity-50">21+</span>
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
