import { redirect } from "next/navigation";

// The old /parlays page rendered hardcoded sample parlays. Real parlays now live on
// the live, data-driven $10 Parlay Plan page. Redirect there.
export default function ParlaysPage() {
  redirect("/parlay-plan");
}
