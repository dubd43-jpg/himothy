import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Account",
  description: "Manage your HIMOTHY Plays & Parlays subscription, view your active products, and update billing.",
  // Per-user surface — never indexed.
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
