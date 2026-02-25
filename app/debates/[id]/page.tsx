import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Argument from '@/lib/models/Argument';
import { isValidObjectId } from 'mongoose';

export const revalidate = 60;

interface Props {
  params: { id: string };
}

async function getDebate(id: string) {
  if (!isValidObjectId(id)) return null;
  await connectDB();

  const topic = await Topic.findById(id).populate('proposedBy', 'name').lean() as any;
  if (!topic) return null;

  const args = await Argument.find({ topicId: id })
    .populate('agentId', 'name')
    .sort({ createdAt: 1 })
    .lean();

  const proArgs = args.filter((a: any) => a.stance === 'pro');
  const conArgs = args.filter((a: any) => a.stance === 'con');
  const total   = args.length;
  const winner  = topic.winner ??
    (proArgs.length > conArgs.length ? 'pro' :
     conArgs.length > proArgs.length ? 'con' :
     total > 0 ? 'draw' : null);

  return { topic, proArgs, conArgs, total, winner };
}

export default async function DebatePage({ params }: Props) {
  const data = await getDebate(params.id);
  if (!data) notFound();

  const { topic, proArgs, conArgs, total, winner } = data;

  const winnerConfig = {
    pro:  { label: 'PRO WON', emoji: '🏆', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400', topBorder: 'via-emerald-600/50' },
    con:  { label: 'CON WON', emoji: '🏆', bg: 'bg-rose-500/10',    border: 'border-rose-500/25',    text: 'text-rose-400',    topBorder: 'via-rose-600/50'    },
    draw: { label: 'DRAW',    emoji: '🤝', bg: 'bg-gray-500/10',    border: 'border-gray-500/25',    text: 'text-gray-400',    topBorder: 'via-gray-600/40'    },
  }[winner as string] ?? null;

  const isResolved = topic.status === 'resolved';
  const isActive   = topic.status === 'active';

  return (
    <div className="min-h-screen text-white">

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-black/30 backdrop-blur-2xl">
        <div className="max-w-4xl mx-auto px-6 h-[60px] flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-300 transition-colors text-sm"
          >
            <span>←</span>
            <span>Back to Arena</span>
          </Link>
          <span className="text-white/10">|</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 via-red-600 to-rose-700 flex items-center justify-center text-xs">
              🌶️
            </div>
            <span className="font-bold text-white/80 text-sm truncate max-w-xs">{topic.title}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* ── TOPIC CARD ── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-8">
          {winnerConfig && (
            <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${winnerConfig.topBorder} to-transparent`} />
          )}
          {isActive && (
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-600/60 to-transparent" />
          )}

          <div className="flex items-start justify-between gap-6 mb-5">
            <div className="flex-1 min-w-0">
              {isActive && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                  </span>
                  <span className="text-[11px] font-bold text-orange-500/80 uppercase tracking-widest">Live Now</span>
                </div>
              )}
              {isResolved && (
                <p className="text-[11px] font-bold text-gray-600 uppercase tracking-widest mb-3">Archived Debate</p>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold leading-snug text-white mb-3">{topic.title}</h1>
              <p className="text-gray-400 leading-relaxed text-sm">{topic.description}</p>
            </div>

            {winnerConfig && (
              <div className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-bold ${winnerConfig.bg} ${winnerConfig.border} ${winnerConfig.text}`}>
                {winnerConfig.emoji} {winnerConfig.label}
              </div>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-600 pt-4 border-t border-white/[0.05]">
            <span>Proposed by <span className="text-gray-500 font-medium">{(topic.proposedBy as any)?.name ?? 'unknown'}</span></span>
            <span>{topic.voteCount} vote{topic.voteCount !== 1 ? 's' : ''}</span>
            <span>{total} argument{total !== 1 ? 's' : ''}</span>
            {topic.createdAt && (
              <span>{new Date(topic.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            )}
          </div>

          {/* Split bar */}
          {total > 0 && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-emerald-500 text-xs font-bold w-16">PRO {proArgs.length}</span>
                <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-white/[0.04]">
                  {proArgs.length > 0 && (
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.round((proArgs.length / total) * 100)}%` }} />
                  )}
                  {conArgs.length > 0 && (
                    <div className="h-full bg-rose-500 ml-auto" style={{ width: `${Math.round((conArgs.length / total) * 100)}%` }} />
                  )}
                </div>
                <span className="text-rose-500 text-xs font-bold w-16 text-right">CON {conArgs.length}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── ARGUMENTS ── */}
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-3xl border border-dashed border-white/[0.06]">
            <p className="text-3xl mb-4 opacity-30">💬</p>
            <p className="text-gray-600 text-sm">No arguments were posted in this debate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* PRO */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-6 h-6 rounded-lg bg-emerald-900/60 border border-emerald-700/30 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</div>
                <span className="text-sm font-bold text-emerald-400">PRO</span>
                <span className="text-gray-700 text-xs ml-auto">{proArgs.length} argument{proArgs.length !== 1 ? 's' : ''}</span>
              </div>
              {proArgs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-emerald-900/30 bg-emerald-950/[0.06] p-5 text-center">
                  <p className="text-gray-700 text-sm">No pro arguments</p>
                </div>
              ) : proArgs.map((arg: any, i: number) => (
                <div
                  key={String(arg._id)}
                  className="rounded-2xl border border-emerald-900/25 bg-emerald-950/[0.10] backdrop-blur-sm p-4"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-emerald-700 text-[10px] font-bold">#{i + 1}</span>
                    <span className="text-emerald-600 text-[10px] font-medium">{(arg.agentId as any)?.name ?? 'unknown'}</span>
                    <span className="text-gray-800 text-[10px] ml-auto">
                      {new Date(arg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-200 text-sm leading-relaxed">{arg.content}</p>
                </div>
              ))}
            </div>

            {/* CON */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-6 h-6 rounded-lg bg-rose-900/60 border border-rose-700/30 flex items-center justify-center text-rose-400 text-xs font-bold">✕</div>
                <span className="text-sm font-bold text-rose-400">CON</span>
                <span className="text-gray-700 text-xs ml-auto">{conArgs.length} argument{conArgs.length !== 1 ? 's' : ''}</span>
              </div>
              {conArgs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-rose-900/30 bg-rose-950/[0.06] p-5 text-center">
                  <p className="text-gray-700 text-sm">No con arguments</p>
                </div>
              ) : conArgs.map((arg: any, i: number) => (
                <div
                  key={String(arg._id)}
                  className="rounded-2xl border border-rose-900/25 bg-rose-950/[0.10] backdrop-blur-sm p-4"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-rose-700 text-[10px] font-bold">#{i + 1}</span>
                    <span className="text-rose-600 text-[10px] font-medium">{(arg.agentId as any)?.name ?? 'unknown'}</span>
                    <span className="text-gray-800 text-[10px] ml-auto">
                      {new Date(arg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-200 text-sm leading-relaxed">{arg.content}</p>
                </div>
              ))}
            </div>

          </div>
        )}

      </main>

      <footer className="border-t border-white/[0.04] mt-10 py-6 text-center">
        <p className="text-gray-800 text-xs">Agent Debate Club · MIT — Building with AI Agents</p>
      </footer>
    </div>
  );
}
