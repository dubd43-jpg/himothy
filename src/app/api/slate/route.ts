import { NextResponse } from 'next/server';
import { Pick } from '@/lib/picksData';
import { validateAndTrackGame } from '@/lib/validation';

export async function POST(req: Request) {
  try {
    const { picks } = await req.json();
    const results = await Promise.all((picks as Pick[]).map(async (p) => {
      try {
        return await validateAndTrackGame(p);
      } catch (err) {
        console.error("Single pick validation failed:", err);
        return { 
          pick: p, 
          preValidation: { 
             game_valid: false, 
             safe_to_publish: false, 
             reason_if_invalid: "System timeout or upstream error during validation." 
          }, 
          tracking: null 
        };
      }
    }));
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error in slate validation:", error);
    return NextResponse.json({ success: false, results: [] }, { status: 500 });
  }
}
