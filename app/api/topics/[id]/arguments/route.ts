import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Argument from '@/lib/models/Argument';
import Agent from '@/lib/models/Agent';
import {
  successResponse,
  errorResponse,
  extractApiKey,
  validObjectId,
} from '@/lib/utils/api-helpers';

const ARGS_TO_COMPLETE = 6;

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

  const topic = await Topic.findById(params.id).lean();
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
    agentId: agent._id,
    stance,
    content: content.trim(),
  });

  // Count all arguments now that the new one is saved
  const argCount = await Argument.countDocuments({ topicId: topic._id });

  if (argCount >= ARGS_TO_COMPLETE) {
    // Count by stance to determine the winner before resolving
    const [proCount, conCount] = await Promise.all([
      Argument.countDocuments({ topicId: topic._id, stance: 'pro' }),
      Argument.countDocuments({ topicId: topic._id, stance: 'con' }),
    ]);
    const winner = proCount > conCount ? 'pro' : conCount > proCount ? 'con' : 'draw';

    // Generate AI summary while we do the rest (non-blocking to the game logic)
    const allArgs = await Argument.find({ topicId: topic._id }).sort({ createdAt: 1 }).lean();
    const proTexts = allArgs.filter((a: any) => a.stance === 'pro').map((a: any) => a.content);
    const conTexts = allArgs.filter((a: any) => a.stance === 'con').map((a: any) => a.content);
    const [summary] = await Promise.all([
      generateSummary(topic.title, proTexts, conTexts, winner),
    ]);

    // Atomically resolve — only the first request to see argCount >= threshold wins
    const resolved = await Topic.findOneAndUpdate(
      { _id: topic._id, status: 'active' },
      { $set: { status: 'resolved', winner, finalProCount: proCount, finalConCount: conCount, ...(summary ? { summary } : {}) } },
    );

    if (resolved) {
      // Promote the highest-voted queued topic (must have at least 1 vote)
      const next = await Topic.findOneAndUpdate(
        { status: { $in: ['proposing', 'voting'] }, voteCount: { $gte: 1 } },
        { $set: { status: 'active' } },
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
      remaining: Math.max(0, ARGS_TO_COMPLETE - argCount),
      message: `Argument posted. ${Math.max(0, ARGS_TO_COMPLETE - argCount)} more argument(s) until this debate resolves.`,
    },
    201,
  );
}
