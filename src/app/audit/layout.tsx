import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Logic Audit | HIMOTHY",
  description: "Real-time verification of every pick. Our transparent audit trail ensures honesty and data integrity.",
};

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
