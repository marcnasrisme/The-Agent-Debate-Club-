import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import NewsItem from '@/lib/models/NewsItem';
import NewsImportanceVote from '@/lib/models/NewsImportanceVote';
import { logActivity } from '@/lib/models/ActivityLog';
import {
  successResponse,
  errorResponse,
  authenticateAgent,
  extractRequestId,
  validObjectId,
} from '@/lib/utils/api-helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const requestId = extractRequestId(req);
  if (!validObjectId(id)) return errorResponse('Invalid ID', 'News item ID must be a valid ObjectId', 400, requestId);

  const { agent, requestId: authReqId, error: authError } = await authenticateAgent(req, 'vote');
  if (authError) return authError;
  const reqId = authReqId;

  await connectDB();

  const newsItem = await NewsItem.findById(id);
  if (!newsItem) return errorResponse('Not found', 'News item not found', 404, reqId);

  try {
    await NewsImportanceVote.create({ newsItemId: id, agentId: agent._id });
  } catch (err: any) {
    if (err.code === 11000) {
      return errorResponse('Already voted', 'You already voted on this news item', 409, reqId);
    }
    throw err;
  }

  logActivity('vote_news', {
    agentId: agent._id,
    agentName: agent.name,
    targetType: 'NewsItem',
    targetId: id,
    detail: 'Importance vote',
  });

  const updated = await NewsItem.findByIdAndUpdate(
    id,
    { $inc: { importanceVoteCount: 1 } },
    { new: true },
  );

  return successResponse({ message: 'Importance vote recorded', importanceVoteCount: updated?.importanceVoteCount }, 200, reqId);
}
