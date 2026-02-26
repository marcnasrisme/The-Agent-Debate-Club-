import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Season from '@/lib/models/Season';
import Topic from '@/lib/models/Topic';
import Argument from '@/lib/models/Argument';
import Agent from '@/lib/models/Agent';
import RuleProposal from '@/lib/models/RuleProposal';
import { successResponse, errorResponse, safeEqual } from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key') ?? '';
  const expected = process.env.ADMIN_KEY ?? '';

  if (!adminKey || !expected || !safeEqual(adminKey, expected))
    return errorResponse('Forbidden', 'Valid X-Admin-Key header required', 403);

  await connectDB();

  // Find current season
  let current = await Season.findOne({ endedAt: null }).sort({ number: -1 });
  if (!current) {
    current = await Season.create({ number: 1 });
  }

  // Compute champion: agent with most wins in this season's resolved debates
  const seasonTopics = await Topic.find({
    season: current.number,
    status: 'resolved',
    winner: { $in: ['pro', 'con'] },
  }).lean();

  const winCounts = new Map<string, number>();
  const argCountMap = new Map<string, number>();

  for (const t of seasonTopics) {
    const args = await Argument.find({ topicId: t._id }).lean();
    const participants = new Map<string, string[]>();

    for (const a of args as any[]) {
      const aid = String(a.agentId);
      if (!participants.has(aid)) participants.set(aid, []);
      participants.get(aid)!.push(a.stance);
    }

    for (const [aid, stances] of Array.from(participants.entries())) {
      const proCount = stances.filter(s => s === 'pro').length;
      const conCount = stances.filter(s => s === 'con').length;
      const side = proCount >= conCount ? 'pro' : 'con';

      argCountMap.set(aid, (argCountMap.get(aid) ?? 0) + stances.length);

      if (t.winner === side) {
        winCounts.set(aid, (winCounts.get(aid) ?? 0) + 1);
      }
    }
  }

  let championId: string | null = null;
  let maxWins = 0;
  for (const [aid, wins] of Array.from(winCounts.entries())) {
    if (wins > maxWins || (wins === maxWins && (argCountMap.get(aid) ?? 0) > (argCountMap.get(championId ?? '') ?? 0))) {
      maxWins = wins;
      championId = aid;
    }
  }

  // End current season
  current.endedAt = new Date();
  if (championId) current.championAgentId = championId as any;
  await current.save();

  // Expire active rules
  await RuleProposal.updateMany(
    { status: 'active' },
    { $set: { status: 'expired', expiredAt: new Date() } },
  );
  await RuleProposal.updateMany(
    { status: { $in: ['proposing', 'voting'] }, season: current.number },
    { $set: { status: 'rejected' } },
  );

  // Create new season
  const nextNumber = current.number + 1;
  const newSeason = await Season.create({ number: nextNumber });

  const champion = championId
    ? await Agent.findById(championId).select('name').lean()
    : null;

  return successResponse({
    message: `Season ${current.number} ended. Season ${nextNumber} has begun!`,
    endedSeason: {
      number: current.number,
      champion: champion ? { id: championId, name: (champion as any).name, wins: maxWins } : null,
    },
    newSeason: { number: nextNumber },
  });
}
