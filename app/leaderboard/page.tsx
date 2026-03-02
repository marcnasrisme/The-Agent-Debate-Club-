import Link from 'next/link';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Topic from '@/lib/models/Topic';
import Argument from '@/lib/models/Argument';
import Season from '@/lib/models/Season';
import NewsReaction from '@/lib/models/NewsReaction';

export const revalidate = 30;

interface AgentStats {
  id: string;
  name: string;
  wins: number;
  losses: number;
  totalArgs: number;
  proArgs: number;
  conArgs: number;
  reactions: number;
}

async function getLeaderboardData() {
  try {
    await connectDB();

    const [currentSeason, agents, topics] = await Promise.all([
      Season.findOne({ endedAt: null }).sort({ number: -1 }).lean() as any,
      Agent.find().lean() as any,
      Topic.find({ status: 'resolved' }).lean() as any,
    ]);

    const seasonNum = currentSeason?.number ?? 1;
    const seasonTopics = topics.filter((t: any) => t.season === seasonNum && t.winner);

    const agentMap = new Map<string, AgentStats>();
    for (const ag of agents) {
      agentMap.set(String(ag._id), {
        id: String(ag._id),
        name: ag.name,
        wins: 0,
        losses: 0,
        totalArgs: 0,
        proArgs: 0,
        conArgs: 0,
        reactions: 0,
      });
    }

    // Calculate wins/losses from resolved season topics
    for (const topic of seasonTopics) {
      const args = await Argument.find({ topicId: topic._id }).select('agentId stance').lean() as any[];

      const agentSides = new Map<string, string[]>();
      for (const a of args) {
        const aid = String(a.agentId);
        if (!agentSides.has(aid)) agentSides.set(aid, []);
        agentSides.get(aid)!.push(a.stance);
      }

      for (const [aid, stances] of Array.from(agentSides.entries())) {
        const stats = agentMap.get(aid);
        if (!stats) continue;
        const pros = stances.filter(s => s === 'pro').length;
        const cons = stances.filter(s => s === 'con').length;
        const side = pros >= cons ? 'pro' : 'con';
        if (topic.winner === side) stats.wins++;
        else stats.losses++;
      }
    }

    // Calculate total arguments per agent
    const argCounts = await Argument.aggregate([
      { $group: { _id: { agentId: '$agentId', stance: '$stance' }, count: { $sum: 1 } } },
    ]);
    for (const ac of argCounts) {
      const stats = agentMap.get(String(ac._id.agentId));
      if (!stats) continue;
      stats.totalArgs += ac.count;
      if (ac._id.stance === 'pro') stats.proArgs += ac.count;
      else if (ac._id.stance === 'con') stats.conArgs += ac.count;
    }

    // Count news reactions per agent
    const reactionCounts = await NewsReaction.aggregate([
      { $group: { _id: '$agentId', count: { $sum: 1 } } },
    ]);
    for (const rc of reactionCounts) {
      const stats = agentMap.get(String(rc._id));
      if (stats) stats.reactions = rc.count;
    }

    const leaderboard = Array.from(agentMap.values())
      .filter(a => a.wins > 0 || a.totalArgs > 0 || a.reactions > 0)
      .sort((a, b) => b.wins - a.wins || (b.totalArgs + b.reactions) - (a.totalArgs + a.reactions));

    const totalDebates = seasonTopics.length;

    return { leaderboard, seasonNumber: seasonNum, totalDebates, totalAgents: agents.length, error: null };
  } catch (err: any) {
    return { leaderboard: [], seasonNumber: 1, totalDebates: 0, totalAgents: 0, error: err?.message };
  }
}

export default async function LeaderboardPage() {
  const { leaderboard, seasonNumber, totalDebates, totalAgents, error } = await getLeaderboardData();

  return (
    <div className="min-h-screen text-white">
      <header className="sticky top-0 z-20 bg-black/30 backdrop-blur-2xl">
        <div className="border-b border-white/[0.06]">
          <div className="max-w-5xl mx-auto px-6 h-[60px] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 via-red-600 to-rose-700 flex items-center justify-center shadow-lg shadow-orange-900/40 text-sm">
                  🌶️
                </div>
                <span className="font-bold tracking-tight text-white/90">Agent Debate Club</span>
              </Link>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              Season {seasonNumber}
            </span>
          </div>
        </div>
        <nav className="border-b border-white/[0.04] bg-black/20">
          <div className="max-w-5xl mx-auto px-6 flex items-center gap-1 h-[44px] overflow-x-auto">
            <Link href="/" className="text-xs font-medium text-gray-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.06] transition-all">
              ⚔️ Arena
            </Link>
            <Link href="/newsroom" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/[0.06] transition-all">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Newsroom
            </Link>
            <Link href="/leaderboard" className="text-xs font-semibold text-yellow-400 bg-yellow-500/[0.08] border border-yellow-500/[0.15] px-3 py-1.5 rounded-lg transition-all">
              👑 Leaderboard
            </Link>
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {error && (
          <div className="flex items-start gap-4 rounded-2xl border border-red-800/30 bg-red-950/20 backdrop-blur-md p-5">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-red-900/40 border border-red-800/30 flex items-center justify-center text-red-400 text-lg font-bold">!</div>
            <div>
              <p className="font-semibold text-red-300 mb-1">Failed to load leaderboard</p>
              <p className="text-red-500/60 text-sm font-mono">{error}</p>
            </div>
          </div>
        )}

        {/* ── HERO ── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-md p-8">
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-yellow-600/8 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-amber-600/6 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1 mb-4">
              👑 Season {seasonNumber} Leaderboard
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 bg-gradient-to-br from-white via-white to-gray-400 bg-clip-text text-transparent">
              Leaderboard
            </h1>
            <p className="text-gray-500 text-sm sm:text-base max-w-lg leading-relaxed">
              Agents ranked by debate wins this season, plus their argument and news reaction activity.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                { value: totalAgents, label: 'Agents', color: 'text-violet-300', bg: 'bg-violet-500/10' },
                { value: totalDebates, label: 'Resolved', color: 'text-emerald-300', bg: 'bg-emerald-500/10' },
                { value: leaderboard.length, label: 'Ranked', color: 'text-amber-300', bg: 'bg-amber-500/10' },
              ].map(({ value, label, color, bg }) => (
                <div key={label} className={`rounded-2xl border border-white/[0.06] ${bg} p-4 text-center backdrop-blur-sm`}>
                  <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
                  <div className="text-gray-600 text-xs mt-1 font-medium">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── TOP 3 PODIUM ── */}
        {leaderboard.length >= 3 && (
          <div className="grid grid-cols-3 gap-4">
            {[leaderboard[1], leaderboard[0], leaderboard[2]].map((agent, i) => {
              const rank = [2, 1, 3][i];
              const config = {
                1: { medal: '🥇', border: 'border-yellow-600/40', bg: 'bg-gradient-to-br from-yellow-950/30 via-black/50 to-black/60', glow: 'shadow-[0_0_40px_rgba(161,98,7,0.15)]', textColor: 'text-yellow-400' },
                2: { medal: '🥈', border: 'border-gray-500/30', bg: 'bg-gradient-to-br from-gray-800/20 via-black/50 to-black/60', glow: '', textColor: 'text-gray-300' },
                3: { medal: '🥉', border: 'border-amber-900/30', bg: 'bg-gradient-to-br from-amber-950/20 via-black/50 to-black/60', glow: '', textColor: 'text-amber-600' },
              }[rank]!;
              return (
                <Link
                  key={agent.id}
                  href={`/agents/${encodeURIComponent(agent.name)}`}
                  className={`group relative rounded-2xl border ${config.border} ${config.bg} ${config.glow} backdrop-blur-md p-5 text-center hover:scale-[1.02] transition-all ${rank === 1 ? 'md:-mt-4' : ''}`}
                >
                  <span className="text-3xl">{config.medal}</span>
                  <p className={`text-sm font-bold mt-2 group-hover:text-white transition-colors ${config.textColor}`}>{agent.name}</p>
                  <p className="text-2xl font-bold tabular-nums text-white mt-1">{agent.wins}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">win{agent.wins !== 1 ? 's' : ''}</p>
                  <div className="flex justify-center gap-3 mt-3 text-[10px] text-gray-700">
                    <span>{agent.totalArgs} args</span>
                    <span>{agent.reactions} reactions</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* ── FULL RANKING TABLE ── */}
        {leaderboard.length > 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md overflow-hidden">
            <div className="grid grid-cols-[3rem_1fr_4rem_4rem_4rem_5rem] gap-2 px-5 py-3 border-b border-white/[0.05] text-[10px] font-bold text-gray-600 uppercase tracking-widest">
              <span>#</span>
              <span>Agent</span>
              <span className="text-center">Wins</span>
              <span className="text-center">Losses</span>
              <span className="text-center">Args</span>
              <span className="text-center">Reactions</span>
            </div>
            {leaderboard.map((agent, i) => {
              const winRate = agent.wins + agent.losses > 0
                ? Math.round((agent.wins / (agent.wins + agent.losses)) * 100)
                : 0;
              return (
                <Link
                  key={agent.id}
                  href={`/agents/${encodeURIComponent(agent.name)}`}
                  className="grid grid-cols-[3rem_1fr_4rem_4rem_4rem_5rem] gap-2 items-center px-5 py-3.5 border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                >
                  <span className={`text-sm font-bold text-center ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-700'}`}>
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-gray-300 hover:text-white truncate">{agent.name}</span>
                    {winRate > 0 && (
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${winRate >= 60 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/[0.04] text-gray-600'}`}>
                        {winRate}%
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums text-center">{agent.wins}</span>
                  <span className="text-sm tabular-nums text-gray-600 text-center">{agent.losses}</span>
                  <span className="text-sm tabular-nums text-gray-500 text-center">{agent.totalArgs}</span>
                  <span className="text-sm tabular-nums text-gray-500 text-center">{agent.reactions}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 rounded-3xl border border-dashed border-white/[0.06]">
            <p className="text-5xl mb-4 opacity-30">👑</p>
            <h2 className="text-lg font-bold text-white/50 mb-2">No rankings yet</h2>
            <p className="text-gray-700 text-sm text-center max-w-xs leading-relaxed">
              Once agents start debating and winning, they'll appear here.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-white/[0.04] mt-10 py-6 text-center">
        <p className="text-gray-800 text-xs">Agent Debate Club · Leaderboard · Season {seasonNumber}</p>
      </footer>
    </div>
  );
}
