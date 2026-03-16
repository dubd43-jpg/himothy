"use client";

import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XOctagon, 
  MinusCircle, 
  Edit, 
  Trash2, 
  Save, 
  X,
  Target,
  Zap,
  Activity
} from 'lucide-react';

export default function AdminPicksManager() {
  const [isAdding, setIsAdding] = useState(false);
  
  return (
    <div className="space-y-8 pb-24">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Target className="w-8 h-8 text-primary" /> Picks Manager
          </h1>
          <p className="text-muted-foreground">Add new plays, settle completed games, and manage the board.</p>
        </div>
        
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${isAdding ? 'bg-secondary text-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(234,179,8,0.3)]'}`}
        >
          {isAdding ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {isAdding ? 'Cancel' : 'Add New Pick'}
        </button>
      </div>

      {/* Add New Pick Form (Hidden by default) */}
      {isAdding && (
        <div className="bg-card border-2 border-primary/50 rounded-xl p-6 shadow-xl animate-in slide-in-from-top-4 fade-in duration-300">
          <h2 className="text-xl font-black uppercase mb-6 flex items-center gap-2 border-b border-border pb-3">
            <Zap className="w-5 h-5 text-primary" /> Create New Official Play
          </h2>
          
          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Sport</label>
                <select className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option>NBA</option>
                  <option>NFL</option>
                  <option>MLB</option>
                  <option>NHL</option>
                  <option>College Basketball</option>
                  <option>College Football</option>
                  <option>Soccer</option>
                  <option>Tennis</option>
                </select>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Game / Matchup</label>
                <input type="text" placeholder="e.g., Lakers vs. Nuggets" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Market Type</label>
                <select className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                  <option>Spread</option>
                  <option>Moneyline</option>
                  <option>Total (Over/Under)</option>
                  <option>Player Prop</option>
                  <option>Team Prop</option>
                </select>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Selection (The Pick)</label>
                <input type="text" placeholder="e.g., Nikola Jokic OVER 24.5 Points" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-bold" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Odds</label>
                <input type="text" placeholder="-110" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Confidence (1-10)</label>
                <input type="number" min="1" max="10" step="0.1" placeholder="8.5" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Assign To Package</label>
                <select className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-bold text-primary">
                  <option>HIMOTHY VIP 4-PACK</option>
                  <option>PRESSURE PACK</option>
                  <option>HIMOTHY GRAND SLAM</option>
                  <option>MY PERSONAL PLAY</option>
                  <option>HAILMARY LOTTOS</option>
                  <option>FREE PLAY / TEASER</option>
                </select>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <label className="text-xs font-bold text-muted-foreground uppercase">System Reasoning (Shown to Users)</label>
                <textarea rows={2} placeholder="Why is the algorithm locking this in?" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"></textarea>
              </div>

            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button 
                type="button" 
                onClick={() => setIsAdding(false)}
                className="px-6 py-2.5 rounded-lg font-bold bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="px-6 py-2.5 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Publish Pick to Board
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Control Tools */}
      <div className="flex flex-col md:flex-row justify-between gap-4 bg-card border border-border p-4 rounded-xl">
        <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search picks, teams, players..." className="bg-transparent border-none outline-none text-sm w-full text-foreground" />
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:bg-secondary transition-colors">
            <Filter className="w-4 h-4" /> Status: <span className="text-foreground font-semibold">Pending</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:bg-secondary transition-colors">
            <Activity className="w-4 h-4" /> Today's Board
          </button>
        </div>
      </div>

      {/* Picks Data Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Details</th>
                <th className="p-4 font-bold">Selection & Odds</th>
                <th className="p-4 font-bold hidden md:table-cell">Package</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              
              {/* Row 1 - Pending */}
              <tr className="hover:bg-secondary/20 transition-colors">
                <td className="p-4">
                  <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                    Live / Pending
                  </span>
                </td>
                <td className="p-4">
                  <div className="font-bold text-foreground">Lakers vs. Nuggets</div>
                  <div className="text-xs text-muted-foreground mt-0.5">NBA • Today, 10:00 PM EST</div>
                </td>
                <td className="p-4">
                  <div className="font-bold text-primary">Nikola Jokic OVER 24.5 Pts</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">-110</div>
                </td>
                <td className="p-4 hidden md:table-cell">
                  <span className="text-xs font-bold uppercase tracking-wider bg-background px-2 py-1 rounded border border-border">
                    Pressure Pack
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Settle Buttons */}
                    <button className="p-1.5 hover:bg-green-500/20 text-green-500 rounded transition-colors" title="Mark as Win">
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <button className="p-1.5 hover:bg-red-500/20 text-red-500 rounded transition-colors" title="Mark as Loss">
                      <XOctagon className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-border mx-1"></div>
                    <button className="p-1.5 hover:bg-secondary text-muted-foreground rounded transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>

              {/* Row 2 - Pending */}
              <tr className="hover:bg-secondary/20 transition-colors">
                <td className="p-4">
                  <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                    Live / Pending
                  </span>
                </td>
                <td className="p-4">
                  <div className="font-bold text-foreground">Arsenal vs. Chelsea</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Soccer • Tomorrow, 3:00 PM EST</div>
                </td>
                <td className="p-4">
                  <div className="font-bold text-primary">Arsenal Moneyline</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">+125</div>
                </td>
                <td className="p-4 hidden md:table-cell">
                  <span className="text-xs font-bold uppercase tracking-wider bg-background px-2 py-1 rounded border border-border text-primary/80">
                    My Personal Play
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-1.5 hover:bg-green-500/20 text-green-500 rounded transition-colors" title="Mark as Win">
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <button className="p-1.5 hover:bg-red-500/20 text-red-500 rounded transition-colors" title="Mark as Loss">
                      <XOctagon className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-border mx-1"></div>
                    <button className="p-1.5 hover:bg-secondary text-muted-foreground rounded transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>

              {/* Row 3 - Settled Win */}
              <tr className="bg-green-500/5 hover:bg-green-500/10 transition-colors">
                <td className="p-4">
                  <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-500 border border-green-500/20 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Won
                  </span>
                </td>
                <td className="p-4 opacity-80">
                  <div className="font-bold text-foreground line-through decoration-green-500/50">Knicks vs. Celtics</div>
                  <div className="text-xs text-muted-foreground mt-0.5">NBA • Yesterday</div>
                </td>
                <td className="p-4 opacity-80">
                  <div className="font-bold text-foreground">Knicks +4.5</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">-110</div>
                </td>
                <td className="p-4 hidden md:table-cell opacity-80">
                  <span className="text-xs font-bold uppercase tracking-wider bg-background px-2 py-1 rounded border border-border">
                    Grand Slam
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-1.5 hover:bg-secondary text-muted-foreground rounded transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
