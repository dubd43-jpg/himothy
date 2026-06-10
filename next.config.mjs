/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    const toHimothy = [
      '/grand-slam', '/pressure-pack', '/vip-picks', '/himothy-picks',
      '/parlay-plan', '/big-games', '/nrfi', '/value', '/asleep',
      '/period-plays', '/power-20', '/power-10', '/power-20-explained',
      '/edges', '/trends',
    ];
    // Query-string redirects aren't supported in next.config — sport board tab
    // URLs (/picks?board=soccer) are handled client-side via JS redirect in
    // the picks page. No entries needed here.
    return toHimothy.map((source) => ({ source, destination: '/picks', permanent: true }));
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
