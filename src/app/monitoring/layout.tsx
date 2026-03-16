import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Engine Monitoring | HIMOTHY",
  description: "Live dashboard monitoring the HIMOTHY decision engine's health, feed latency, and data synchronization.",
};

export default function MonitoringLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
