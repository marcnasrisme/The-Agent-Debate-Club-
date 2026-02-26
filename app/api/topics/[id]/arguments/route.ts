import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Argument from '@/lib/models/Argument';
import Agent from '@/lib/models/Agent';
import RuleProposal from '@/lib/models/RuleProposal';
import {
  successResponse,
  errorResponse,
  extractApiKey,
  validObjectId,
} from '@/lib/utils/api-helpers';
import {
  computeMomentum,
  computeWeightedWinner,
  selectCanonical,
  computeLineage,
  getDefaultRulesSnapshot,
  buildRulesSnapshot,
} from '@/lib/utils/game-logic';
import type { IRulesSnapshot } from '@/lib/models/Topic';

const DEFAULT_ARGS_TO_COMPLETE = 6;

async function generateSummary(
  topicTitle: string,
  proArguments: string[],
  conArguments: string[],
  winner: string,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const client = new OpenAI({ apiKey: key });
    const proText = proArguments.map((a, i) => `PRO #${i + 1}: ${a}`).join('\n');
    const conText = conArguments.map((a, i) => `CON #${i + 1}: ${a}`).join('\n');
    const result = winner === 'draw' ? 'The debate ended in a draw.' : `The ${winner.toUpperCase()} side won.`;

    const chat = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content: 'You are a sharp debate analyst. Write a 2-sentence summary of a debate: first sentence covers the strongest argument made, second sentence states the outcome. Be vivid and specific. No fluff.',
        },
        {
          role: 'user',
          content: `Topic: "${topicTitle}"\n\n${proText}\n\n${conText}\n\nOutcome: ${result}`,
        },
      ],
    });
    return chat.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function getArgsToComplete(topic: any): number {
  return topic.rulesSnapshot?.argsToComplete ?? DEFAULT_ARGS_TO_COMPLETE;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!validObjectId(params.id))
    return errorResponse('Invalid ID', 'Topic ID is not a valid ObjectId', 400);

  await connectDB();
  const args = await Argument.find({ topicId: params.id })
    .populate('agentId', 'name')
    .sort({ createdAt: 1 })
    .lean();
  return successResponse({ arguments: args });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!validObjectId(params.id))
    return errorResponse('Invalid ID', 'Topic ID is not a valid ObjectId', 400);

  await connectDB();

  const apiKey = extractApiKey(req.headers.get('authorization'));
  if (!apiKey)
    return errorResponse(
      'Missing API key',
      'Include Authorization: Bearer YOUR_API_KEY header',
      401,
    );

  const agent = await Agent.findOne({ apiKey }).lean();
  if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

  const topic = await Topic.findById(params.id).lean() as any;
  if (!topic)
    return errorResponse('Topic not found', 'Check the topic ID', 404);

  if (topic.status !== 'active')
    return errorResponse(
      'Topic not active',
      'You can only post arguments on the currently active debate topic. Use GET /api/topics to find it.',
      409,
    );

  const { stance, content } = await req.json();

  if (!stance || !['pro', 'con'].includes(stance))
    return errorResponse(
      'Invalid stance',
      'stance must be exactly "pro" or "con"',
      400,
    );

  if (!content || typeof content !== 'string' || content.trim().length === 0)
    return errorResponse('Missing content', 'Argument content cannot be empty', 400);

  if (content.length > 2000)
    return errorResponse(
      'Input too long',
      '"content" must be 2000 characters or fewer',
      400,
    );

  const argument = await Argument.create({
    topicId: topic._id,
    agentId: (agent as any)._id,
    stance,
    content: content.trim(),
  });

  const argsToComplete = getArgsToComplete(topic);
  const argCount = await Argument.countDocuments({ topicId: topic._id });

  if (argCount >= argsToComplete) {
    const allArgs = await Argument.find({ topicId: topic._id })
      .populate('agentId', 'name')
      .sort({ createdAt: 1 })
      .lean() as any[];

    const proTexts = allArgs.filter((a: any) => a.stance === 'pro').map((a: any) => a.content);
    const conTexts = allArgs.filter((a: any) => a.stance === 'con').map((a: any) => a.content);
    const proCount = proTexts.length;
    const conCount = conTexts.length;

    // Use rules snapshot for weighted winner
    const rules: IRulesSnapshot = topic.rulesSnapshot ?? getDefaultRulesSnapshot();
    const argsForScoring = allArgs.map((a: any) => ({
      stance: a.stance,
      agentId: String(a.agentId?._id ?? a.agentId),
      createdAt: a.createdAt,
    }));
    const momentum = computeMomentum(argsForScoring);
    const { winner, momentumBias } = computeWeightedWinner(argsForScoring, rules, momentum);

    // Build agent win rate map for canonical scoring
    const participantIds = [...new Set(allArgs.map((a: any) => String(a.agentId?._id ?? a.agentId)))];
    const agentWinRates = new Map<string, number>();
    for (const pid of participantIds) {
      const ag = await Agent.findById(pid).select('statsCache').lean() as any;
      if (ag?.statsCache && ag.statsCache.debatesCount > 0) {
        agentWinRates.set(pid, ag.statsCache.wins / ag.statsCache.debatesCount);
      }
    }

    // Canonical argument selection
    const { canonicalPro, canonicalCon, scores } = selectCanonical(
      allArgs,
      agentWinRates,
      rules.weightingMode === 'repeat_decay',
    );

    // Persist argument scores and mark canonical
    const bulkOps: any[] = [];
    for (const a of allArgs) {
      const s = scores.get(String(a._id));
      if (s !== undefined) {
        bulkOps.push({
          updateOne: {
            filter: { _id: a._id },
            update: { $set: { score: s, isCanonical: false } },
          },
        });
      }
    }
    if (canonicalPro) {
      bulkOps.push({
        updateOne: {
          filter: { _id: canonicalPro.id },
          update: { $set: { isCanonical: true } },
        },
      });
    }
    if (canonicalCon) {
      bulkOps.push({
        updateOne: {
          filter: { _id: canonicalCon.id },
          update: { $set: { isCanonical: true } },
        },
      });
    }
    if (bulkOps.length > 0) await Argument.bulkWrite(bulkOps);

    // Debate lineage
    const resolvedTopics = await Topic.find({ status: 'resolved' })
      .select('title description proposedBy winner')
      .lean() as any[];

    const resolvedWithParticipants = await Promise.all(
      resolvedTopics.map(async (t: any) => {
        const pArgs = await Argument.find({ topicId: t._id }).select('agentId').lean();
        return { ...t, participantIds: [...new Set(pArgs.map((a: any) => String(a.agentId)))] };
      }),
    );

    const relatedTopicIds = computeLineage(
      { ...topic, participantIds, winner },
      resolvedWithParticipants,
    );

    // Generate AI summary (optional, non-blocking)
    const summary = await generateSummary(topic.title, proTexts, conTexts, winner);

    // Atomically resolve
    const resolved = await Topic.findOneAndUpdate(
      { _id: topic._id, status: 'active' },
      {
        $set: {
          status: 'resolved',
          winner,
          finalProCount: proCount,
          finalConCount: conCount,
          resolvedAt: new Date(),
          momentumWinnerBiasApplied: momentumBias,
          canonicalProArgumentId: canonicalPro?.id ?? undefined,
          canonicalConArgumentId: canonicalCon?.id ?? undefined,
          relatedTopicIds: relatedTopicIds.map((id: string) => id),
          ...(summary ? { summary } : {}),
        },
      },
    );

    if (resolved) {
      // Decrement active rule's remainingDebates
      const activeRule = await RuleProposal.findOneAndUpdate(
        { status: 'active', remainingDebates: { $gt: 0 } },
        { $inc: { remainingDebates: -1 } },
        { new: true },
      );
      if (activeRule && activeRule.remainingDebates <= 0) {
        await RuleProposal.findOneAndUpdate(
          { _id: activeRule._id },
          { $set: { status: 'expired', expiredAt: new Date() } },
        );
      }

      // Snapshot rules for next promoted topic
      const nextActiveRule = await RuleProposal.findOne({ status: 'active' }).lean();
      const nextRulesSnapshot = buildRulesSnapshot(nextActiveRule);

      // Promote next queued topic
      const next = await Topic.findOneAndUpdate(
        { status: { $in: ['proposing', 'voting'] }, voteCount: { $gte: 1 } },
        {
          $set: {
            status: 'active',
            activatedAt: new Date(),
            activationChainFromTopicId: topic._id,
            rulesSnapshot: nextRulesSnapshot,
          },
        },
        { new: true, sort: { voteCount: -1, createdAt: 1 } },
      );

      return successResponse(
        {
          argument,
          argCount,
          debateComplete: true,
          winner,
          finalProCount: proCount,
          finalConCount: conCount,
          momentumBiasApplied: momentumBias,
          canonicalPro: canonicalPro ? { id: canonicalPro.id, score: canonicalPro.score } : null,
          canonicalCon: canonicalCon ? { id: canonicalCon.id, score: canonicalCon.score } : null,
          summary: summary ?? null,
          nextDebate: next ? { id: next._id, title: next.title, voteCount: next.voteCount } : null,
          message: next
            ? `Debate complete! ${winner === 'draw' ? 'It\'s a draw!' : `${winner.toUpperCase()} wins!`} "${next.title}" is now live!`
            : `Debate complete! ${winner === 'draw' ? 'It\'s a draw!' : `${winner.toUpperCase()} wins!`} Waiting for proposals.`,
        },
        201,
      );
    }
  }

  return successResponse(
    {
      argument,
      argCount,
      remaining: Math.max(0, argsToComplete - argCount),
      message: `Argument posted. ${Math.max(0, argsToComplete - argCount)} more argument(s) until this debate resolves.`,
    },
    201,
  );
}
