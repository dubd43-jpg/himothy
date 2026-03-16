import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Globe } from "lucide-react";

export const metadata: Metadata = {
  title: "Sports Picks Today | Expert Betting Picks & Analysis | HIMOTHY",
  description: "Get expert sports picks for today across all major leagues. NBA, NFL, MLB, NHL, and Global markets analyzed 24/7.",
  keywords: ["sports picks today", "expert sports picks", "betting analysis", "free sports picks", "sharp sports plays"],
};

export default function SportsPicksTodayPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <PicksPageTemplate
      title={`Global Picks – ${today}`}
      subtitle="Complete multi-sport board analysis. Every market we monitor is checked for decision-engine authorized edges."
      badge="Global Coverage"
      icon={<Globe className="w-9 h-9 text-purple-500" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="🌏 Total Board Coverage: From domestic pro leagues to overseas niche markets."
    />
  );
}
