// Server-side redirect to /picks?board=power20 — avoids the client-side useEffect
// race that caused a double-fetch (Agent 5 finding 2026-06-03).
import { redirect } from 'next/navigation';

export default function Power20Page() {
  redirect('/picks?board=power20');
}
