import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Picks Hub | HIMOTHY",
  description: "Access the full slate of HIMOTHY analyzed picks. From Grand Slams to Overseas markets, every play is audited for edge.",
};

export default function PicksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
