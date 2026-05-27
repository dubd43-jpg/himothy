import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Hide admin + raw API responses + debug endpoints from search engines. The
        // /pick/[gameId] pages stay indexable — each one is a unique landing for a
        // specific matchup which is real SEO value.
        disallow: ['/admin/', '/api/', '/audit'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
