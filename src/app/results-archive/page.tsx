import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, History, Filter, Download, Calendar } from 'lucide-react';
import { RecordDashboard } from '@/components/RecordDashboard';

export const metadata: Metadata = {
  title: "Results Archive | HIMOTHY Performance History",
  description: "Browse the complete historical archive of HIMOTHY picks. Filter by category, year, and league for absolute transparency.",
};

export default function ResultsArchivePage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <Link href="/results" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
            <ArrowLeft className="w-4 h-4" /> Back to Latest Results
          </Link>
          
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:text-primary transition-colors">
              <Calendar className="w-4 h-4" /> Range
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:text-primary transition-colors">
              <Filter className="w-4 h-4" /> Filter
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>
        
        <div className="border-b border-border pb-8">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight flex items-center gap-4">
             <History className="w-10 h-10 text-primary" /> Results <span className="italic font-light">Archive</span>
          </h1>
          <p className="text-xl text-muted-foreground mt-2 max-w-2xl">
             Official archive since April 20, 2026 (ET). Every authorized published pick is preserved with final result and settlement timestamps.
          </p>
        </div>

        <RecordDashboard />

        <div className="bg-card border border-border rounded-3xl p-12 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <History className="w-16 h-16 text-muted-foreground mx-auto opacity-20" />
              <h3 className="text-2xl font-black uppercase tracking-tight">Official Record Window</h3>
              <p className="text-muted-foreground font-medium">
                No fake backfill is used. This archive starts at the official public tracking date and builds forward with real settled outcomes only.
              </p>
              <div className="pt-6">
                 <Link href="/results" className="text-sm font-black text-primary underline underline-offset-8 uppercase tracking-widest">View Recent Results While Loading</Link>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
