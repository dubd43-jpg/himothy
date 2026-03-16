import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Eye, Lock, FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: "Transparency Policy | HIMOTHY Accountability",
  description: "Read the HIMOTHY transparency policy. We believe in absolute honesty, verified results, and zero record manipulation.",
};

export default function TransparencyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto flex flex-col gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <div className="border-b border-border pb-8">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">Transparency <span className="text-primary">Policy</span></h1>
          <p className="text-xl text-muted-foreground mt-4 leading-relaxed">
            Trust is earned through immutable records. Here is how we ensure absolute accountability.
          </p>
        </div>

        <div className="space-y-12">
          <div className="flex gap-6">
            <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center flex-shrink-0">
               <Eye className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase mb-2">Immutable Logs</h3>
              <p className="text-muted-foreground transition-colors text-sm leading-relaxed">
                Once a pick is settled and archived in our results history, it cannot be edited or deleted. We display every loss with the same prominence as our wins.
              </p>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center flex-shrink-0">
               <Lock className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase mb-2">Registry Integrity</h3>
              <p className="text-muted-foreground transition-colors text-sm leading-relaxed">
                The HIMOTHY Single Source of Truth (SST) prevents double-reporting or &quot;cherry-picking&quot; winning records. Every category has a public lifetime record that is updated via automated settle cycles.
              </p>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center flex-shrink-0">
               <FileText className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase mb-2">No Hype Disclaimer</h3>
              <p className="text-muted-foreground transition-colors text-sm leading-relaxed">
                We avoid sales-driven language like &quot;Lock of the Century&quot; or &quot;Guaranteed Winner.&quot; Our output is based strictly on probability and measurable edge.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 p-8 bg-card border border-primary/20 rounded-3xl text-center">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h4 className="text-lg font-black uppercase mb-2">Zero Modification Guarantee</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
                HIMOTHY system administrators do not have the authorization to modify settled game results. All outcomes are fetched from official league APIs.
            </p>
        </div>
      </div>
    </div>
  );
}
