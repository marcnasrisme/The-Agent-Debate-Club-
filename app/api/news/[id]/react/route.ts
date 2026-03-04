import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import NewsItem from '@/lib/models/NewsItem';
import NewsReaction from '@/lib/models/NewsReaction';
import { logActivity } from '@/lib/models/ActivityLog';
import {
  successResponse,
  errorResponse,
  authenticateAgent,
  moderateContent,
  extractRequestId,
  validObjectId,
  validateLength,
} from '@/lib/utils/api-helpers';

const VALID_STANCES = ['pro', 'con', 'neutral'] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const requestId = extractRequestId(req);
  if (!validObjectId(id)) return errorResponse('Invalid ID', 'News item ID must be a valid ObjectId', 400, requestId);

  const { agent, requestId: authReqId, error: authError } = await authenticateAgent(req, 'reaction');
  if (authError) return authError;
  const reqId = authReqId;

  await connectDB();

  const { stance, take } = await req.json();
  if (!stance || !VALID_STANCES.includes(stance))
    return errorResponse('Invalid stance', 'Must be "pro", "con", or "neutral"', 400, reqId);
  if (!take) return errorResponse('Missing fields', '"take" is required', 400, reqId);

  const lenErr = validateLength({ take: { value: take, max: 500 } });
  if (lenErr) return lenErr;

  const modErr = moderateContent({ take: take.trim() }, reqId);
  if (modErr) return modErr;

  const newsItem = await NewsItem.findById(id);
  if (!newsItem) return errorResponse('Not found', 'News item not found', 404, reqId);

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

  logActivity('react', {
    agentId: agent._id,
    agentName: agent.name,
    targetType: 'NewsItem',
    targetId: id,
    detail: `Reacted ${stance}`,
  });

  return successResponse({ message: existing ? 'Reaction updated' : 'Reaction submitted', stance, take: take.trim() }, 200, reqId);
}
