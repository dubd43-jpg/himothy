import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Mail, MessageSquare, Twitter, Globe, Send } from 'lucide-react';

export const metadata: Metadata = {
  title: "Contact Us | HIMOTHY Support",
  description: "Get in touch with the HIMOTHY team. For support, partnerships, or model inquiries.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto flex flex-col gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <div className="border-b border-border pb-8">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">Contact <span className="text-primary italic">The Engine Room</span></h1>
          <p className="text-xl text-muted-foreground mt-4 leading-relaxed">
            Need support or have questions about the decision model? Reach out to the team behind the tech.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="p-3 bg-secondary rounded-xl text-primary">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-1">Email Support</h3>
                <p className="text-lg font-bold">support@himothy.com</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="p-3 bg-secondary rounded-xl text-blue-400">
                <Twitter className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-1">X / Twitter</h3>
                <p className="text-lg font-bold">@HIMOTHY</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="p-3 bg-secondary rounded-xl text-emerald-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-1">Telegram</h3>
                <p className="text-lg font-bold">@HimothyEngine</p>
              </div>
            </div>
          </div>

          <form className="bg-card border border-border p-8 rounded-3xl space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</label>
                <input type="text" className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary transition-all text-sm font-medium" placeholder="Your Name" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email</label>
                <input type="email" className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary transition-all text-sm font-medium" placeholder="email@example.com" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Message</label>
                <textarea rows={4} className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary transition-all text-sm font-medium resize-none" placeholder="What can we help with?" />
              </div>
              <button 
                type="button" 
                className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:translate-y-[-2px] transition-all shadow-lg flex items-center justify-center gap-2"
              >
                Send Message <Send className="w-4 h-4" />
              </button>
          </form>
        </div>
      </div>
    </div>
  );
}
