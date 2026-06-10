// Power 10 is the chalk-heavy 7-10 leg variant of Power 20. Both products live
// under the same engine; this page redirects to the main picks board which has the
// Power 10/20 tab. Added 2026-06-03 because /pricing was selling power_10 with no
// destination — buyers paid then landed on a 404.

import { redirect } from 'next/navigation';

export default function Power10Page() {
  redirect('/picks?board=power10');
}
