import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: "Terms & Conditions | HIMOTHY",
  description: "Terms and conditions for using the HIMOTHY sports intelligence platform.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto flex flex-col gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <h1 className="text-3xl font-black uppercase">Terms & Conditions</h1>
        <div className="prose prose-invert max-w-none text-muted-foreground space-y-6">
          <p>HIMOTHY is an informational tool only. We do not provide gambling services.</p>
          <h2 className="text-xl font-bold text-foreground uppercase pt-4">1. Use of Service</h2>
          <p>Users must be 21+ to view sports pick data. Our analysis is based on historical patterns and real-time roster data but does not guarantee success.</p>
          <h2 className="text-xl font-bold text-foreground uppercase pt-4">2. Subscription & Access</h2>
          <p>All sales are final. Since our product consists of digital information authorized at the moment of release, we do not offer refunds.</p>
        </div>
      </div>
    </div>
  );
}
