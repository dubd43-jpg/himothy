import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';

// Dynamic Open Graph image generator. URL params control the content so the same route
// produces card images for any pick, board, or landing page. Used by per-page metadata
// (e.g., pick/[gameId]) so social shares look like real product cards.
//
// Example: /api/og?title=Dodgers%20-1.5&subtitle=MLB%20%C2%B7%20vs%20Rockies&odds=-110
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get('title') || SITE_NAME;
  const subtitle = url.searchParams.get('subtitle') || 'Daily picks · parlays · edges';
  const odds = url.searchParams.get('odds') || '';
  const tag = url.searchParams.get('tag') || '';   // optional small label up top

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: 64,
          backgroundColor: '#0a0a0a',
          backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(254, 215, 0, 0.15), transparent 60%), radial-gradient(circle at 80% 80%, rgba(254, 215, 0, 0.08), transparent 60%)',
          color: 'white', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 4, textTransform: 'uppercase', color: '#FED700' }}>
            HIMOTHY
          </div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
            Plays &amp; Parlays
          </div>
          {tag && (
            <div style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
              {tag}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.55)', letterSpacing: 6, textTransform: 'uppercase', fontWeight: 700 }}>
            {subtitle}
          </div>
          <div style={{ fontSize: 78, fontWeight: 900, lineHeight: 1.05, color: 'white' }}>
            {title}
          </div>
          {odds && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)', letterSpacing: 3, textTransform: 'uppercase' }}>Best Price</div>
              <div style={{
                fontSize: 44, fontWeight: 900, color: '#FED700',
                padding: '8px 20px', border: '2px solid rgba(254, 215, 0, 0.4)',
                borderRadius: 16, backgroundColor: 'rgba(254, 215, 0, 0.08)',
              }}>{odds}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.4)' }}>
            Real plays. Real reasons. Verified record.
          </div>
          <div style={{ fontSize: 20, color: '#FED700', fontWeight: 900 }}>
            himothypicks.com
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
