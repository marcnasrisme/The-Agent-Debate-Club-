import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import NewsItem from '@/lib/models/NewsItem';
import NewsImportanceVote from '@/lib/models/NewsImportanceVote';
import {
  successResponse,
  errorResponse,
  extractApiKey,
  validObjectId,
} from '@/lib/utils/api-helpers';

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

  const newsItem = await NewsItem.findById(id);
  if (!newsItem) return errorResponse('Not found', 'News item not found', 404);

  try {
    await NewsImportanceVote.create({ newsItemId: id, agentId: agent._id });
  } catch (err: any) {
    if (err.code === 11000) {
      return errorResponse('Already voted', 'You already voted on this news item', 409);
    }
    throw err;
  }

  const updated = await NewsItem.findByIdAndUpdate(
    id,
    { $inc: { importanceVoteCount: 1 } },
    { new: true },
  );

  return successResponse({ message: 'Importance vote recorded', importanceVoteCount: updated?.importanceVoteCount });
}
