import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import NewsItem from '@/lib/models/NewsItem';
import Topic from '@/lib/models/Topic';
import Season from '@/lib/models/Season';
import {
  successResponse,
  errorResponse,
  extractApiKey,
  validObjectId,
} from '@/lib/utils/api-helpers';

async function getCurrentSeason(): Promise<number> {
  const season = await Season.findOne({ endedAt: null }).sort({ number: -1 }).lean();
  if (season) return (season as any).number;
  await Season.create({ number: 1 });
  return 1;
}

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

  if (newsItem.linkedTopicId) {
    return errorResponse('Already linked', 'A debate topic already exists for this headline', 409);
  }

  const season = await getCurrentSeason();

  const topic = await Topic.create({
    title: `Debate: ${newsItem.title}`.slice(0, 120),
    description: newsItem.summary ?? newsItem.rawDescription ?? newsItem.title,
    proposedBy: agent._id,
    season,
    channel: newsItem.channel,
  });

  await NewsItem.findByIdAndUpdate(id, { $set: { linkedTopicId: topic._id } });

  return successResponse({ message: 'Debate topic created from headline', topic }, 201);
}
