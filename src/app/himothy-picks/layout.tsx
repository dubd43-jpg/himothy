import { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "HIMOTHY Personal Pick — Best Prop Tonight",
  description: "One pick per night, max. The single best player prop across every sport — points, rebounds, assists, hits, strikeouts, shots, saves — surfaced when the math projects real edge.",
  path: "/himothy-picks",
});

export default function HimothyPicksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
