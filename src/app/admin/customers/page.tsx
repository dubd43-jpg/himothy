"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search, Clock, AlertCircle, CheckCircle2, Plus, X } from "lucide-react";

const SECRET_KEY = "himothy_admin_secret";

interface SubscriptionRow {
  productKey: string;
  status: string;
  accessUntil: string | null;
  amountPaidCents: number | null;
  isOneTime: boolean;
  stripeSubscriptionId: string | null;
  createdAt: string;
}

interface CustomerRow {
  id: string;
  email: string;
  createdAt: string;
  state: string | null;
  ageConfirmed: boolean | null;
  ageConfirmedAt: string | null;
  subscriptions: SubscriptionRow[];
}

interface ApiResponse {
  success: boolean;
  summary: { totalUsers: number; activeSubscribers: number; totalSubscriptionRows: number; activeSubscriptionRows: number };
  customers: CustomerRow[];
}

function formatMoney(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function isActive(s: SubscriptionRow): boolean {
  if (!s.accessUntil) return false;
  return new Date(s.accessUntil).getTime() > Date.now();
}

export default function CustomersAdminPage() {
  const [secret, setSecret] = useState('');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setSecret(localStorage.getItem(SECRET_KEY) || '');
  }, []);
  useEffect(() => { if (secret) load(); /* eslint-disable-next-line */ }, [secret, showInactive]);

  async function load() {
    if (!secret) { setError('Enter admin secret'); return; }
    setLoading(true); setError(null);
    try {
      const url = new URL('/api/admin/customers', window.location.origin);
      if (query.trim()) url.searchParams.set('q', query.trim());
      if (showInactive) url.searchParams.set('showInactive', 'true');
      const res = await fetch(url.toString(), { headers: { 'x-admin-secret': secret } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'failed');
      setData(json);
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  async function patchSubscription(subscriptionId: string, action: 'extend_days' | 'revoke', days?: number) {
    if (!secret) return;
    if (action === 'revoke' && !confirm('Revoke access for this subscription?')) return;
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'PATCH',
        headers: { 'x-admin-secret': secret, 'content-type': 'application/json' },
        body: JSON.stringify({ subscriptionId, action, days }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'failed');
      await load();
    } catch (e: any) { alert(String(e?.message || e)); }
  }

  function saveSecret(s: string) {
    setSecret(s);
    if (typeof window !== 'undefined') localStorage.setItem(SECRET_KEY, s);
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground mt-1">View, extend, or revoke any subscription. Stripe webhook keeps this in sync automatically.</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase px-3 py-2 rounded text-xs disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {!secret && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="text-xs uppercase font-black text-muted-foreground">Admin Secret</div>
            <input type="password" placeholder="adm_..." onBlur={(e) => saveSecret(e.target.value)} className="w-full bg-background border border-border rounded px-3 py-2 text-sm" />
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded">{error}</div>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Users</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.summary.totalUsers}</div>
              </div>
              <div className="bg-card border border-emerald-400/30 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Active Subscribers</div>
                <div className="text-2xl font-black tabular-nums mt-1 text-emerald-400">{data.summary.activeSubscribers}</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Subscriptions</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.summary.totalSubscriptionRows}</div>
              </div>
              <div className="bg-card border border-emerald-400/30 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Active Subscriptions</div>
                <div className="text-2xl font-black tabular-nums mt-1 text-emerald-400">{data.summary.activeSubscriptionRows}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 bg-card border border-border rounded px-3 py-2 flex-1 min-w-[260px]">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text" placeholder="Search by email..."
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                  className="bg-transparent flex-1 text-sm outline-none"
                />
                <button onClick={load} className="text-xs font-black uppercase text-primary">Search</button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show churned customers
              </label>
            </div>

            <div className="space-y-3">
              {data.customers.length === 0 && (
                <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                  No customers match your filters.
                </div>
              )}
              {data.customers.map((c) => {
                const activeSubs = c.subscriptions.filter(isActive);
                return (
                  <div key={c.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3 justify-between">
                      <div>
                        <div className="font-black text-base">{c.email}</div>
                        <div className="text-xs text-muted-foreground">
                          User since {formatDate(c.createdAt)}
                          {' · '}{c.subscriptions.length} subscription(s)
                          {' · '}{activeSubs.length} active
                          {c.state ? <> · <span className="text-foreground font-bold">{c.state}</span></> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.ageConfirmed ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase px-2 py-1 rounded" title={c.ageConfirmedAt ? `Confirmed ${formatDate(c.ageConfirmedAt)}` : undefined}>
                            <CheckCircle2 className="w-3 h-3" /> 21+
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-400/10 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase px-2 py-1 rounded">
                            <AlertCircle className="w-3 h-3" /> Age not confirmed
                          </span>
                        )}
                        {activeSubs.length > 0
                          ? <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase px-2 py-1 rounded"><CheckCircle2 className="w-3 h-3" /> Active</span>
                          : <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-black uppercase px-2 py-1 rounded"><AlertCircle className="w-3 h-3" /> Churned</span>}
                      </div>
                    </div>

                    {c.subscriptions.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="text-left py-1.5">Product</th>
                              <th className="text-left">Status</th>
                              <th className="text-right">Amount</th>
                              <th className="text-left">Type</th>
                              <th className="text-right">Access Until</th>
                              <th className="text-right">Created</th>
                              <th className="text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.subscriptions.map((s, i) => {
                              const active = isActive(s);
                              return (
                                <tr key={i} className="border-t border-border/40">
                                  <td className="py-2 font-bold">{s.productKey}</td>
                                  <td><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{s.status}</span></td>
                                  <td className="text-right tabular-nums">{formatMoney(s.amountPaidCents)}</td>
                                  <td>{s.isOneTime ? 'One-time' : 'Recurring'}</td>
                                  <td className="text-right tabular-nums">{formatDate(s.accessUntil)}</td>
                                  <td className="text-right tabular-nums">{formatDate(s.createdAt)}</td>
                                  <td className="text-right">
                                    {(s as any).id ? (
                                      <div className="flex gap-1 justify-end">
                                        <button onClick={() => patchSubscription((s as any).id, 'extend_days', 7)} className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/30 px-2 py-1 rounded hover:bg-primary/20">
                                          <Plus className="w-3 h-3" /> 7d
                                        </button>
                                        {active && (
                                          <button onClick={() => patchSubscription((s as any).id, 'revoke')} className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-1 rounded hover:bg-red-500/20">
                                            <X className="w-3 h-3" /> Revoke
                                          </button>
                                        )}
                                      </div>
                                    ) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
