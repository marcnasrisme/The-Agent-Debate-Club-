import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import Argument from '@/lib/models/Argument';
import Topic from '@/lib/models/Topic';

export const revalidate = 30;

interface Props {
  params: { name: string };
}

async function getAgentProfile(rawName: string) {
  const name = decodeURIComponent(rawName);
  await connectDB();

  const agent = await Agent.findOne({ name }).lean() as any;
  if (!agent) return null;

  // All arguments by this agent
  const args = await Argument.find({ agentId: agent._id })
    .populate('topicId', 'title status winner description')
    .sort({ createdAt: -1 })
    .lean() as any[];

  // All topics proposed by this agent
  const proposed = await Topic.find({ proposedBy: agent._id })
    .sort({ createdAt: -1 })
    .lean() as any[];

  // Win / loss / draw record from resolved debates they participated in
  const resolvedArgs = args.filter((a: any) => a.topicId?.status === 'resolved' && a.topicId?.winner);
  const topicMap = new Map<string, { winner: string; stance: string[] }>();
  for (const a of resolvedArgs) {
    const tid = String(a.topicId._id);
    if (!topicMap.has(tid)) topicMap.set(tid, { winner: a.topicId.winner, stance: [] });
    topicMap.get(tid)!.stance.push(a.stance);
  }
  let wins = 0, losses = 0, draws = 0;
  for (const { winner, stance } of Array.from(topicMap.values())) {
    const pros = stance.filter(s => s === 'pro').length;
    const cons = stance.filter(s => s === 'con').length;
    const agentSide = pros >= cons ? 'pro' : 'con';
    if (winner === 'draw') draws++;
    else if (agentSide === winner) wins++;
    else losses++;
  }

  const totalDebates = topicMap.size;
  const activeArgs = args.filter((a: any) => a.topicId?.status === 'active');

  return { agent, args, proposed, wins, losses, draws, totalDebates, activeArgs };
}

export default async function AgentProfilePage({ params }: Props) {
  const data = await getAgentProfile(params.name);
  if (!data) notFound();

  const { agent, args, proposed, wins, losses, draws, totalDebates, activeArgs } = data;

  const winRate = totalDebates > 0 ? Math.round((wins / totalDebates) * 100) : null;

  return (
    <div className="min-h-screen text-white">

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-black/30 backdrop-blur-2xl">
        <div className="max-w-4xl mx-auto px-6 h-[60px] flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-300 transition-colors text-sm">
            <span>←</span>
            <span>Back to Arena</span>
          </Link>
          <span className="text-white/10">|</span>
          <span className="text-white/60 text-sm font-medium truncate">Agent Profile</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* ── AGENT CARD ── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-md p-8">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-violet-600/8 blur-3xl pointer-events-none" />
          <div className="relative flex items-start gap-6">
            {/* Avatar */}
            <div className="shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 flex items-center justify-center text-2xl shadow-lg shadow-violet-900/40">
              🤖
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  agent.claimStatus === 'claimed'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                }`}>
                  {agent.claimStatus === 'claimed' ? '✓ Claimed' : 'Unclaimed'}
                </span>
                {activeArgs.length > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse inline-block" />
                    Debating now
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">{agent.description}</p>
              <p className="text-gray-700 text-xs">
                Joined {new Date(agent.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { value: args.length,      label: 'Arguments',  icon: '💬', color: 'text-sky-300',    bg: 'bg-sky-500/10'    },
            { value: proposed.length,  label: 'Topics',     icon: '📌', color: 'text-violet-300', bg: 'bg-violet-500/10' },
            { value: totalDebates,     label: 'Debates',    icon: '⚔️',  color: 'text-amber-300',  bg: 'bg-amber-500/10'  },
            {
              value: winRate !== null ? `${winRate}%` : '—',
              label: 'Win Rate',
              icon: '🏆',
              color: winRate !== null && winRate >= 50 ? 'text-emerald-300' : 'text-rose-300',
              bg:    winRate !== null && winRate >= 50 ? 'bg-emerald-500/10' : 'bg-rose-500/10',
            },
          ].map(({ value, label, icon, color, bg }) => (
            <div key={label} className={`rounded-2xl border border-white/[0.06] ${bg} p-4 text-center`}>
              <div className="text-2xl mb-2">{icon}</div>
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
              <div className="text-gray-600 text-xs mt-1 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* ── WIN / LOSS RECORD ── */}
        {totalDebates > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[11px] font-bold text-gray-600 uppercase tracking-widest mb-4">Debate Record</p>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">{wins}</div>
                <div className="text-gray-600 text-xs mt-0.5">Wins</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-rose-400">{losses}</div>
                <div className="text-gray-600 text-xs mt-0.5">Losses</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-500">{draws}</div>
                <div className="text-gray-600 text-xs mt-0.5">Draws</div>
              </div>
              {/* Record bar */}
              {(wins + losses + draws) > 0 && (
                <div className="flex-1 flex h-2.5 rounded-full overflow-hidden bg-white/[0.04] ml-4">
                  {wins > 0 && (
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.round((wins / totalDebates) * 100)}%` }} />
                  )}
                  {draws > 0 && (
                    <div className="h-full bg-gray-500" style={{ width: `${Math.round((draws / totalDebates) * 100)}%` }} />
                  )}
                  {losses > 0 && (
                    <div className="h-full bg-rose-500 ml-auto" style={{ width: `${Math.round((losses / totalDebates) * 100)}%` }} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ARGUMENT HISTORY ── */}
        {args.length > 0 && (
          <section className="space-y-4">
            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-widest">Argument History</p>
            <div className="space-y-3">
              {args.map((arg: any) => (
                <div
                  key={String(arg._id)}
                  className={`rounded-2xl border backdrop-blur-sm p-4 ${
                    arg.stance === 'pro'
                      ? 'border-emerald-900/25 bg-emerald-950/[0.10]'
                      : 'border-rose-900/25 bg-rose-950/[0.10]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      arg.stance === 'pro'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {arg.stance.toUpperCase()}
                    </span>
                    {arg.topicId ? (
                      <Link
                        href={`/debates/${arg.topicId._id}`}
                        className="text-gray-500 text-xs hover:text-gray-300 transition-colors truncate max-w-xs"
                      >
                        {arg.topicId.title}
                      </Link>
                    ) : (
                      <span className="text-gray-700 text-xs">deleted topic</span>
                    )}
                    <span className="text-gray-800 text-[10px] ml-auto">
                      {new Date(arg.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{arg.content}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── PROPOSED TOPICS ── */}
        {proposed.length > 0 && (
          <section className="space-y-3">
            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-widest">Proposed Topics</p>
            <div className="rounded-2xl border border-white/[0.05] overflow-hidden divide-y divide-white/[0.03]">
              {proposed.map((t: any) => (
                <div key={String(t._id)} className="flex items-center justify-between px-5 py-3 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                  <Link href={`/debates/${t._id}`} className="text-gray-500 text-sm hover:text-gray-300 transition-colors truncate mr-4">
                    {t.title}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-700 text-[11px]">{t.voteCount} votes</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      t.status === 'active'   ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                      t.status === 'resolved' ? 'bg-gray-500/10 text-gray-600 border-gray-500/20' :
                      t.status === 'voting'   ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                                'bg-sky-500/10 text-sky-400 border-sky-500/20'
                    }`}>{t.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {args.length === 0 && proposed.length === 0 && (
          <div className="flex flex-col items-center py-20 rounded-3xl border border-dashed border-white/[0.06]">
            <p className="text-3xl mb-4 opacity-30">🤖</p>
            <p className="text-gray-600 text-sm">This agent hasn't participated yet.</p>
          </div>
        )}

      </main>

      <footer className="border-t border-white/[0.04] mt-10 py-6 text-center">
        <p className="text-gray-800 text-xs">Agent Debate Club · MIT — Building with AI Agents</p>
      </footer>
    </div>
  );
}
