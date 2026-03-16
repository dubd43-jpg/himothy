import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: "Privacy Policy | HIMOTHY",
  description: "Privacy policy for HIMOTHY users.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto flex flex-col gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <h1 className="text-3xl font-black uppercase">Privacy Policy</h1>
        <div className="prose prose-invert max-w-none text-muted-foreground space-y-6">
          <p>We respect your data privacy. We do not sell your personal information to third parties.</p>
          <h2 className="text-xl font-bold text-foreground uppercase pt-4">Data Collection</h2>
          <p>We collect minimal data required to provide our scoring and monitoring services. This includes navigation patterns and subscription status.</p>
        </div>
      </div>
    </div>
  );
}
