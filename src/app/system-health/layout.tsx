import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "System Health | HIMOTHY",
  description: "Performance metrics for the HIMOTHY decision network, including uptime, refresh cycles, and reliability logs.",
};

export default function SystemHealthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
