"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Crown,
  Layers,
  ListChecks,
  ShieldCheck,
  Timer,
  TrendingUp,
  History,
  Activity,
} from "lucide-react";
import { LiveScoreBoard } from "@/components/LiveScoreBoard";

interface BoardPick {
  id: string;
  eventName: string;
  awayTeam: string;
  homeTeam: string;
  league: string;
  sport: string;
  startTime: string | null;
  marketType: string;
  selection: string;
  line: string | null;
  odds: string | null;
  sportsbook: string | null;
  reasoning: string | null;
  status: string;
  productType: string;
  sectionType: string;
  groupId: string | null;
  parentProductId: string | null;
  isMainPick: boolean;
  isParlay: boolean;
  displayPriority: number;
}

interface GroupedProduct {
  productId: string;
  productType: string;
  productLabel: string;
  status: string;
  picks: BoardPick[];
}

interface ParlayProduct {
  parlayId: string;
  parlayName: string;
  productLabel: string;
  legs: BoardPick[];
  totalOdds: string | null;
  riskTier: string;
  status: string;
}

interface StructuredBoardResponse {
  success: boolean;
  source: string;
  boardDate: string;
  sections: {
    mainPick: BoardPick | null;
    corePicks: BoardPick[];
    groupedProducts: GroupedProduct[];
    parlayProducts: ParlayProduct[];
  };
  counts: {
    officialStraightPicks: number;
    officialGroupedProducts: number;
    parlays: number;
    totalUniquePicks: number;
  };
}

function formatStartTime(value: string | null) {
  if (!value) return "TBD";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "TBD";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "published" || normalized === "locked") return "Pending";
  if (normalized === "win") return "Win";
  if (normalized === "loss") return "Loss";
  if (normalized === "push") return "Push";
  if (normalized === "live") return "Live";
  return value;
}

function PickDecisionCard({ pick }: { pick: BoardPick }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {pick.awayTeam} vs {pick.homeTeam}
      </div>

      <div className="mt-2 text-xl font-black text-slate-900">{pick.selection}</div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase text-slate-500">League</div>
          <div className="font-semibold">{pick.league || pick.sport}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Starts</div>
          <div className="font-semibold">{formatStartTime(pick.startTime)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Market</div>
          <div className="font-semibold">{pick.marketType}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Status</div>
          <div className="font-semibold">{statusLabel(pick.status)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">Line: {pick.line || "-"}</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">Odds: {pick.odds || "-"}</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">Book: {pick.sportsbook || "TBD"}</span>
        <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">{pick.productType}</span>
      </div>

      {pick.reasoning && <p className="mt-3 text-sm text-slate-600">{pick.reasoning}</p>}
    </article>
  );
}

export default function PicksHubPage() {
  const [board, setBoard] = useState<StructuredBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchBoard = async () => {
      try {
        const res = await fetch("/api/board/structured", { cache: "no-store" });
        const json = (await res.json()) as StructuredBoardResponse;
        if (mounted && json.success) {
          setBoard(json);
        }
      } catch (error) {
        console.error("Structured board fetch failed", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchBoard();
    const interval = setInterval(fetchBoard, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const counts = useMemo(
    () =>
      board?.counts || {
        officialStraightPicks: 0,
        officialGroupedProducts: 0,
        parlays: 0,
        totalUniquePicks: 0,
      },
    [board]
  );

  const mainPick = board?.sections.mainPick || null;
  const corePicks = board?.sections.corePicks || [];
  const groupedProducts = board?.sections.groupedProducts || [];
  const parlayProducts = board?.sections.parlayProducts || [];

  return (
    <div className="min-h-screen bg-slate-50 pb-16 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back Home
          </Link>
          <Link href="/results" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Full Registry
          </Link>
        </div>

        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">HIMOTHY BOARD</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Structured Product Board</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                One game, one card, one official decision. Main Pick is isolated, grouped products stay grouped, and parlays stay in parlay sections.
              </p>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Board Date: {board?.boardDate || new Date().toISOString().slice(0, 10)}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-slate-100 p-3">
              <div className="text-[10px] uppercase text-slate-500">Official Straight Picks</div>
              <div className="text-2xl font-black">{counts.officialStraightPicks}</div>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <div className="text-[10px] uppercase text-slate-500">Grouped Products</div>
              <div className="text-2xl font-black">{counts.officialGroupedProducts}</div>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <div className="text-[10px] uppercase text-slate-500">Parlays</div>
              <div className="text-2xl font-black">{counts.parlays}</div>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <div className="text-[10px] uppercase text-slate-500">Total Unique Picks</div>
              <div className="text-2xl font-black">{counts.totalUniquePicks}</div>
            </div>
          </div>
        </header>

        {loading && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading structured board...</div>
        )}

        <main className="mt-8 space-y-10">
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-amber-800">
              <Crown className="h-5 w-5" />
              <h2 className="text-xl font-black">1. HIMOTHY Main Pick</h2>
            </div>
            {mainPick ? (
              <PickDecisionCard pick={mainPick} />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-white p-4 text-sm text-slate-700">
                No elite Main Pick published for this board.
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              <h2 className="text-xl font-black">2. HIMOTHY Core Picks</h2>
            </div>
            {corePicks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No core straight picks currently published.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {corePicks.map((pick) => (
                  <PickDecisionCard key={pick.id} pick={pick} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Layers className="h-5 w-5 text-slate-700" />
              <h2 className="text-xl font-black">3. VIP / Pressure Grouped Products</h2>
            </div>
            {groupedProducts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No grouped products currently published.</div>
            ) : (
              <div className="space-y-5">
                {groupedProducts.map((product) => (
                  <article key={product.productId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-lg font-black">{product.productLabel}</h3>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{product.picks.length} picks</span>
                    </div>
                    <div className="space-y-3">
                      {product.picks.map((pick, index) => (
                        <div key={pick.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Pick {index + 1}</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">{pick.awayTeam} vs {pick.homeTeam}</div>
                          <div className="text-sm text-slate-700">{pick.selection}</div>
                          <div className="mt-1 text-xs text-slate-600">{pick.marketType} | {pick.odds || "-"} | {pick.sportsbook || "TBD"} | {statusLabel(pick.status)}</div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-slate-700" />
              <h2 className="text-xl font-black">4. Parlay Center</h2>
            </div>
            {parlayProducts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No parlay products currently published.</div>
            ) : (
              <div className="space-y-5">
                {parlayProducts.map((parlay) => (
                  <article key={parlay.parlayId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-black">{parlay.parlayName}</h3>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">Risk: {parlay.riskTier}</span>
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">Status: {statusLabel(parlay.status)}</span>
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">Total Odds: {parlay.totalOdds || "TBD"}</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {parlay.legs.map((leg, index) => (
                        <div key={leg.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Leg {index + 1}</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">{leg.awayTeam} vs {leg.homeTeam}</div>
                          <div className="text-sm text-slate-700">{leg.selection}</div>
                          <div className="mt-1 text-xs text-slate-600">{leg.marketType} | {leg.odds || "-"} | {leg.sportsbook || "TBD"}</div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-slate-700" />
              <h2 className="text-xl font-black">5. Live Sports Board</h2>
            </div>
            <LiveScoreBoard />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-slate-700" />
              <h2 className="text-xl font-black">6. Pick Registry / History</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Link href="/results" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">Results Ledger</Link>
              <Link href="/results-history" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">Pick History</Link>
              <Link href="/results-archive" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">Archive</Link>
            </div>
          </section>
        </main>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1"><Timer className="h-3 w-3" /> Source: {board?.source || "--"}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1"><TrendingUp className="h-3 w-3" /> Refreshes every 30s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
