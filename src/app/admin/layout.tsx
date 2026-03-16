"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Lock, Eye, EyeOff, AlertTriangle, Crown, BarChart3, Target } from "lucide-react";

// =============================================
// CHANGE THIS TO YOUR PASSWORD
const ADMIN_PASSWORD = "HIMOTHY2026!";
// =============================================

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [entered, setEntered] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;

    if (password === ADMIN_PASSWORD) {
      setEntered(true);
      setError(false);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setError(true);
      setPassword("");
      // Lock out after 5 wrong attempts
      if (newAttempts >= 5) {
        setLocked(true);
        setTimeout(() => {
          setLocked(false);
          setAttempts(0);
        }, 30000); // 30 second lockout
      }
    }
  };

  if (!entered) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">

          {/* Logo / Brand */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(212,168,67,0.2)]">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-widest text-foreground">Admin Access</h1>
            <p className="text-muted-foreground text-sm mt-1">HIMOTHY Command Center — Private</p>
          </div>

          {/* Login Card */}
          <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl shadow-black/40">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-2">
                  Admin Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(false); }}
                    placeholder="Enter password..."
                    disabled={locked}
                    className={`w-full bg-background border rounded-lg px-4 py-3 pr-12 text-foreground focus:outline-none focus:ring-2 transition-all ${
                      error 
                        ? "border-red-500 focus:ring-red-500/30" 
                        : "border-border focus:ring-primary/30 focus:border-primary"
                    }`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {error && !locked && (
                  <div className="flex items-center gap-2 mt-2 text-red-500 text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Incorrect password. {5 - attempts} attempt{5 - attempts !== 1 ? "s" : ""} remaining.
                  </div>
                )}

                {locked && (
                  <div className="flex items-center gap-2 mt-2 text-red-500 text-xs font-bold bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                    <Lock className="w-3.5 h-3.5" />
                    Too many attempts. Access locked for 30 seconds.
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={locked || !password}
                className="w-full bg-primary text-primary-foreground font-black py-3 rounded-lg hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(212,168,67,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                <ShieldCheck className="w-5 h-5" />
                {locked ? "Locked..." : "Enter Command Center"}
              </button>
            </form>
          </div>

          <div className="text-center mt-6">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Back to main site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Layout
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Admin Top Bar */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-black text-sm uppercase tracking-widest">HIMOTHY <span className="text-primary">ADMIN</span></span>
          </div>
          <div className="h-5 w-px bg-border hidden md:block" />
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/admin" className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <BarChart3 className="w-3.5 h-3.5" /> Overview
            </Link>
            <Link href="/admin/picks" className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Target className="w-3.5 h-3.5" /> Picks Manager
            </Link>
            <Link href="/admin/pricing" className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Crown className="w-3.5 h-3.5" /> Pricing Control
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-green-500 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Authenticated
          </div>
          <button
            onClick={() => { setEntered(false); setPassword(""); setAttempts(0); }}
            className="text-xs text-muted-foreground hover:text-foreground font-bold transition-colors border border-border px-3 py-1.5 rounded-lg hover:border-primary/50"
          >
            Lock
          </button>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground font-bold transition-colors">
            ← Main Site
          </Link>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 px-6 lg:px-10 py-10 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
