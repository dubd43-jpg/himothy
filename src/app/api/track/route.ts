import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url, pickSelection, sportsbook } = await req.json();
    
    // In a real database, insert into an AuditLog or Analytics table
    console.log(`[CLICK TRACKED] User clicked out to ${sportsbook} (${url}) for pick: ${pickSelection}`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
