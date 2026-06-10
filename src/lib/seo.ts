// Centralized SEO helpers — canonical URL, metadata defaults, structured data.
// Site URL is env-driven so swapping to a custom domain later doesn't need code changes
// (set NEXT_PUBLIC_SITE_URL=https://himothy.com on Vercel and redeploy).

import type { Metadata } from 'next';

// Canonical site URL. Default = himothypicks.com (the registered domain). The Vercel
// preview URL is honored when NEXT_PUBLIC_SITE_URL is set explicitly (preview deploys,
// staging). Production should leave NEXT_PUBLIC_SITE_URL UNSET so it falls back to the
// real domain — that way Google sees one canonical and doesn't split signal across
// the preview URL and the production URL.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://himothypicks.com';
export const SITE_NAME = 'HIMOTHY Plays and Parlays';
export const TWITTER_HANDLE = '@himothypicks';

// Default OG image — the 1200x630 promo art (logo + tagline).
export const DEFAULT_OG_IMAGE = '/promo-join.png';

// Convert a team name to a URL-safe slug: lowercase, ASCII-only, hyphenated.
// "Los Angeles Dodgers" → "los-angeles-dodgers". Used to build pretty matchup URLs.
export function slugifyTeam(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Convert a league name to a URL-safe slug suitable for /picks/[league]/[matchup].
// "MLB" → "mlb", "College Football" → "college-football", "NCAA Basketball" → "ncaa-basketball".
export function slugifyLeague(league: string): string {
  return slugifyTeam(league);
}

// Build the matchup slug we use in pretty URLs: "{away}-vs-{home}-picks".
export function matchupSlug(awayTeam: string, homeTeam: string): string {
  return `${slugifyTeam(awayTeam)}-vs-${slugifyTeam(homeTeam)}-picks`;
}

// Full canonical path for a pretty matchup URL: /picks/[league-slug]/[matchup-slug].
export function matchupPath(league: string, awayTeam: string, homeTeam: string): string {
  return `/picks/${slugifyLeague(league)}/${matchupSlug(awayTeam, homeTeam)}`;
}

export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

interface PageMetaInput {
  title: string;
  description: string;
  path: string;                   // canonical path (e.g., "/picks")
  ogImage?: string;               // path or full URL — defaults to DEFAULT_OG_IMAGE
  keywords?: string[];
  noindex?: boolean;
}

// Build a complete Next.js Metadata object for a page. Includes canonical, OG, Twitter
// card, robots — everything needed for solid SEO + clean social previews.
export function pageMeta({ title, description, path, ogImage, keywords, noindex }: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const image = absoluteUrl(ogImage || DEFAULT_OG_IMAGE);
  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      url,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      title,
      description,
      images: [image],
    },
  };
}

// JSON-LD: SportsOrganization for the brand. Renders to a <script type="application/ld+json">.
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/logo-badge.png'),
    sameAs: [
      'https://twitter.com/himothypicks',
    ],
    description: 'Daily sports picks and parlays — moneylines, spreads, totals, props across NBA, NFL, MLB, NHL, WNBA, soccer, tennis, UFC, golf.',
  };
}

// JSON-LD: WebSite + SearchAction. Tells Google we're a search-target site.
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: SITE_URL,
    name: SITE_NAME,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/picks?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

// JSON-LD: SportsEvent for a single pick's underlying game. Used on /pick/[gameId].
export function sportsEventJsonLd(args: {
  name: string; startDate: string; league: string;
  homeTeam: string; awayTeam: string; gameUrl: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: args.name,
    startDate: args.startDate,
    url: args.gameUrl,
    sport: args.league,
    homeTeam: { '@type': 'SportsTeam', name: args.homeTeam },
    awayTeam: { '@type': 'SportsTeam', name: args.awayTeam },
  };
}

// JSON-LD: FAQPage. Google can show these as expandable rich results directly in the
// search snippet — major real-estate win on the SERP. Each question must have a real
// answer (no truncation, no marketing fluff).
export function faqJsonLd(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

// JSON-LD: CollectionPage — for board / hub pages (e.g., /picks). Tells Google this
// page is a curated list of items, not a single article. Better than generic WebPage.
export function collectionPageJsonLd(args: { url: string; name: string; description: string; itemCount?: number }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: args.url,
    name: args.name,
    description: args.description,
    ...(args.itemCount != null ? { mainEntity: { '@type': 'ItemList', numberOfItems: args.itemCount } } : {}),
  };
}

// JSON-LD: BreadcrumbList for nested pages.
export function breadcrumbsJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

// Helper for inlining JSON-LD <script> tag content. Use directly:
//   <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
export function jsonLdString(data: object): string {
  return JSON.stringify(data);
}

export const AUTHOR_NAME = 'HIMOTHY';

export function articleJsonLd(args: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  imageUrl?: string;
  articleSection?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.headline,
    description: args.description,
    url: absoluteUrl(args.path),
    datePublished: args.datePublished,
    dateModified: args.dateModified || args.datePublished,
    author: { '@type': 'Organization', name: AUTHOR_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: { '@type': 'ImageObject', url: absoluteUrl('/logo-badge.png') } },
    ...(args.imageUrl ? { image: absoluteUrl(args.imageUrl) } : {}),
    ...(args.articleSection ? { articleSection: args.articleSection } : {}),
  };
}
