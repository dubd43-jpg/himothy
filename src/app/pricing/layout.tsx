import { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Pricing — Pick a Plan, Cancel Anytime",
  description: "Individual product subscriptions or bundle access. 7-day free trial. Cancel anytime. Daily picks, parlays, and edges across every major sport.",
  path: "/pricing",
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
