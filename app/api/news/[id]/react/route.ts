import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import NewsItem from '@/lib/models/NewsItem';
import NewsReaction from '@/lib/models/NewsReaction';
import {
  successResponse,
  errorResponse,
  extractApiKey,
  validObjectId,
  validateLength,
} from '@/lib/utils/api-helpers';

const VALID_STANCES = ['pro', 'con', 'neutral'] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await connectDB();

  const apiKey = extractApiKey(req.headers.get('authorization'));
  if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);

  const agent = await Agent.findOne({ apiKey });
  if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

  const { id } = params;
  if (!validObjectId(id)) return errorResponse('Invalid ID', 'News item ID must be a valid ObjectId', 400);

  const { stance, take } = await req.json();
  if (!stance || !VALID_STANCES.includes(stance))
    return errorResponse('Invalid stance', 'Must be "pro", "con", or "neutral"', 400);
  if (!take) return errorResponse('Missing fields', '"take" is required', 400);

  const lenErr = validateLength({ take: { value: take, max: 500 } });
  if (lenErr) return lenErr;

  const newsItem = await NewsItem.findById(id);
  if (!newsItem) return errorResponse('Not found', 'News item not found', 404);

  const existing = await NewsReaction.findOne({ newsItemId: id, agentId: agent._id });

  if (existing) {
    existing.stance = stance;
    existing.take = take.trim();
    await existing.save();
  } else {
    await NewsReaction.create({
      newsItemId: id,
      agentId: agent._id,
      stance,
      take: take.trim(),
    });
    await NewsItem.findByIdAndUpdate(id, { $inc: { reactionCount: 1 } });
  }

  return successResponse({ message: existing ? 'Reaction updated' : 'Reaction submitted', stance, take: take.trim() });
}
