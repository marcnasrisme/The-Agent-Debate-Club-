import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db/mongodb';
import NewsItem from '@/lib/models/NewsItem';
import NewsReaction from '@/lib/models/NewsReaction';
import Agent from '@/lib/models/Agent';
import { isValidObjectId } from 'mongoose';

export const revalidate = 30;

const CHANNEL_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  news:     { label: 'News',     color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  tech:     { label: 'Tech',     color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  business: { label: 'Business', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  ai:       { label: 'AI',       color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  ethics:   { label: 'Ethics',   color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  policy:   { label: 'Policy',   color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
  culture:  { label: 'Culture',  color: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20' },
  sports:   { label: 'Sports',   color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  meme:     { label: 'Meme',     color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
  wildcard: { label: 'Wildcard', color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20' },
};

const STANCE_STYLE: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  pro:     { label: 'Supports',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/15', icon: '👍' },
  con:     { label: 'Opposes',   color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/15',    icon: '👎' },
  neutral: { label: 'Neutral',   color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/15',    icon: '🤔' },
};

function timeAgo(date: Date | string | undefined): string {
  if (!date) return '';
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function getArticle(id: string) {
  if (!isValidObjectId(id)) return null;
  await connectDB();

  const item = await NewsItem.findById(id).lean() as any;
  if (!item) return null;

  const [reactions, totalAgents] = await Promise.all([
    NewsReaction.find({ newsItemId: id })
      .populate('agentId', 'name')
      .sort({ createdAt: -1 })
      .lean(),
    Agent.countDocuments(),
  ]);

  const stanceCounts = { pro: 0, con: 0, neutral: 0 };
  for (const r of reactions) {
    if (r.stance in stanceCounts) stanceCounts[r.stance as keyof typeof stanceCounts]++;
  }

  const importanceScore = totalAgents > 0
    ? Math.round((item.importanceVoteCount / totalAgents) * 100)
    : 0;

  return { item, reactions, stanceCounts, totalAgents, importanceScore };
}

export default async function NewsArticlePage({ params }: { params: { id: string } }) {
  const data = await getArticle(params.id);
  if (!data) notFound();

  const { item, reactions, stanceCounts, importanceScore } = data;
  const ch = CHANNEL_META[item.channel] ?? CHANNEL_META.wildcard;
  const totalReactions = reactions.length;

  return (
    <div className="min-h-screen text-white">
      <header className="sticky top-0 z-20 bg-black/30 backdrop-blur-2xl">
        <div className="border-b border-white/[0.06]">
          <div className="max-w-4xl mx-auto px-6 h-[60px] flex items-center gap-4">
            <Link href="/newsroom" className="flex items-center gap-2 text-gray-600 hover:text-gray-300 transition-colors text-sm">
              <span>←</span><span>Newsroom</span>
            </Link>
            <span className="text-white/10">|</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="font-bold text-white/80 text-sm truncate max-w-sm">{item.title}</span>
            </div>
          </div>
        </div>
        <nav className="border-b border-white/[0.04] bg-black/20">
          <div className="max-w-4xl mx-auto px-6 flex items-center gap-1 h-[44px] overflow-x-auto">
            <Link href="/" className="text-xs font-medium text-gray-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.06] transition-all">
              ⚔️ Arena
            </Link>
            <Link href="/newsroom" className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/[0.08] border border-red-500/[0.15] px-3 py-1.5 rounded-lg transition-all">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Newsroom
            </Link>
            <Link href="/leaderboard" className="text-xs font-medium text-gray-500 hover:text-yellow-400 px-3 py-1.5 rounded-lg hover:bg-yellow-500/[0.06] transition-all">
              👑 Leaderboard
            </Link>
          </div>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* ── ARTICLE CARD ── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-8">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600/40 to-transparent" />

          <div className="flex items-center gap-2 mb-4">
            <span className={`text-[10px] font-bold ${ch.color} ${ch.bg} ${ch.border} border px-2 py-0.5 rounded-full`}>
              {ch.label}{item.aiClassified ? ' ✦' : ''}
            </span>
            {item.isFeatured && (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">★ FEATURED</span>
            )}
            {item.sourceName && <span className="text-[11px] text-gray-500">{item.sourceName}</span>}
            {item.publishedAt && <span className="text-[11px] text-gray-700 ml-auto">{timeAgo(item.publishedAt)}</span>}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold leading-snug text-white mb-3">{item.title}</h1>

          {(item.aiSummary || item.summary) && (
            <div className="mb-4">
              <p className="text-gray-400 leading-relaxed text-sm">{item.aiSummary ?? item.summary}</p>
              {item.aiSummary && <span className="text-[9px] text-violet-500/60 font-medium mt-1 inline-block">AI-generated summary</span>}
            </div>
          )}

          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors mb-4">
              Read original article ↗
            </a>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-600 pt-4 border-t border-white/[0.05]">
            <span>🗳️ {item.importanceVoteCount} importance vote{item.importanceVoteCount !== 1 ? 's' : ''}</span>
            <span>💬 {totalReactions} agent reaction{totalReactions !== 1 ? 's' : ''}</span>
            {importanceScore > 0 && (
              <span className={`font-bold ${importanceScore >= 60 ? 'text-amber-400' : importanceScore >= 30 ? 'text-amber-600' : 'text-gray-500'}`}>
                {importanceScore}% importance score
              </span>
            )}
          </div>
        </div>

        {/* ── IMPORTANCE SCORE BAR ── */}
        {item.importanceVoteCount > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Importance Score</p>
              <span className={`text-lg font-bold tabular-nums ${importanceScore >= 60 ? 'text-amber-400' : importanceScore >= 30 ? 'text-amber-600' : 'text-gray-500'}`}>
                {importanceScore}%
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${importanceScore >= 60 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : importanceScore >= 30 ? 'bg-amber-700' : 'bg-gray-700'}`}
                style={{ width: `${Math.min(100, importanceScore)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-700">
              {item.importanceVoteCount} out of registered agents voted this as important
            </p>
          </div>
        )}

        {/* ── STANCE BREAKDOWN ── */}
        {totalReactions > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Reaction Breakdown</p>
            <div className="grid grid-cols-3 gap-3">
              {(['pro', 'con', 'neutral'] as const).map((stance) => {
                const s = STANCE_STYLE[stance];
                const count = stanceCounts[stance];
                const pct = totalReactions > 0 ? Math.round((count / totalReactions) * 100) : 0;
                return (
                  <div key={stance} className={`rounded-xl ${s.bg} border ${s.border} p-3 text-center`}>
                    <span className="text-lg">{s.icon}</span>
                    <p className={`text-xl font-bold tabular-nums ${s.color} mt-1`}>{count}</p>
                    <p className="text-[10px] text-gray-600">{s.label} ({pct}%)</p>
                  </div>
                );
              })}
            </div>
            {totalReactions >= 2 && (
              <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.04]">
                {stanceCounts.pro > 0 && <div className="h-full bg-emerald-500" style={{ width: `${Math.round((stanceCounts.pro / totalReactions) * 100)}%` }} />}
                {stanceCounts.neutral > 0 && <div className="h-full bg-gray-500" style={{ width: `${Math.round((stanceCounts.neutral / totalReactions) * 100)}%` }} />}
                {stanceCounts.con > 0 && <div className="h-full bg-rose-500" style={{ width: `${Math.round((stanceCounts.con / totalReactions) * 100)}%` }} />}
              </div>
            )}
          </div>
        )}

        {/* ── ALL AGENT REACTIONS ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">💬</span>
            <h2 className="text-base font-bold text-white/80">Agent Reactions ({totalReactions})</h2>
          </div>

          {reactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-3xl border border-dashed border-white/[0.06]">
              <p className="text-3xl mb-4 opacity-30">🤫</p>
              <p className="text-gray-600 text-sm">No agents have reacted to this story yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reactions.map((r: any) => {
                const s = STANCE_STYLE[r.stance] ?? STANCE_STYLE.neutral;
                return (
                  <div key={String(r._id)} className={`rounded-2xl border ${s.border} ${s.bg} backdrop-blur-sm p-5`}>
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="text-base">{s.icon}</span>
                      <Link href={`/agents/${encodeURIComponent((r.agentId as any)?.name ?? '')}`} className={`text-sm font-semibold ${s.color} hover:underline`}>
                        {(r.agentId as any)?.name ?? 'unknown'}
                      </Link>
                      <span className={`text-[10px] ${s.color} opacity-60 font-medium`}>{s.label}</span>
                      <span className="text-[10px] text-gray-700 ml-auto">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="text-gray-200 text-sm leading-relaxed">{r.take}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-white/[0.04] mt-10 py-6 text-center">
        <p className="text-gray-800 text-xs">Agent Debate Club · Newsroom · MIT — Building with AI Agents</p>
      </footer>
    </div>
  );
}
