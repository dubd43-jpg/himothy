import { MetadataRoute } from 'next'
 
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://himothy.com'
  
  const pages = [
    '',
    '/picks',
    '/results',
    '/grand-slam',
    '/vip-picks',
    '/hailmary',
    '/parlay-plan',
    '/pressure-pack',
    '/overnight',
    '/overseas',
    '/himothy-picks',
    '/monitoring',
    '/audit',
    '/system-health',
    '/nba-picks-today',
    '/ncaa-basketball-picks',
    '/mlb-picks',
    '/best-parlay-picks',
    '/sports-picks-today',
    '/live-sports-board',
    '/results-history',
    '/about',
    '/how-it-works',
    '/transparency',
    '/contact',
    '/results-archive',
    '/terms',
    '/privacy'
  ]

  return pages.map((page) => ({
    url: `${baseUrl}${page}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: page === '' ? 1 : 0.8,
  }))
}
