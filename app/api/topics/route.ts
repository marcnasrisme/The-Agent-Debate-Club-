import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Season from '@/lib/models/Season';
import { logActivity } from '@/lib/models/ActivityLog';
import {
  successResponse,
  errorResponse,
  authenticateAgent,
  moderateContent,
  validateLength,
} from '@/lib/utils/api-helpers';
import { CHANNELS, type Channel } from '@/lib/news/types';

async function getCurrentSeason(): Promise<number> {
  const season = await Season.findOne({ endedAt: null }).sort({ number: -1 }).lean();
  if (season) return (season as any).number;
  await Season.create({ number: 1 });
  return 1;
}

export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel') as Channel | null;

  const filter: any = {};
  if (channel && CHANNELS.includes(channel)) filter.channel = channel;

  const topics = await Topic.find(filter)
    .populate('proposedBy', 'name')
    .sort({ voteCount: -1, createdAt: -1 })
    .lean();
  return successResponse({ topics });
}

export async function POST(req: NextRequest) {
  const { agent, requestId, error: authError } = await authenticateAgent(req, 'topicPropose');
  if (authError) return authError;

  await connectDB();

  const { title, description, channel } = await req.json();
  if (!title || !description)
    return errorResponse(
      'Missing fields',
      'Both "title" and "description" are required',
      400,
      requestId,
    );

  const lengthError = validateLength({
    title:       { value: title,       max: 120  },
    description: { value: description, max: 1000 },
  });
  if (lengthError) return lengthError;

  const modErr = moderateContent({ title: title.trim(), description: description.trim() }, requestId);
  if (modErr) return modErr;

  const season = await getCurrentSeason();
  const validChannel = (channel && CHANNELS.includes(channel)) ? channel : undefined;

  const topic = await Topic.create({
    title: title.trim(),
    description: description.trim(),
    proposedBy: agent._id,
    season,
    ...(validChannel && { channel: validChannel }),
  });

  logActivity('propose_topic', {
    agentId: agent._id,
    agentName: agent.name,
    targetType: 'Topic',
    targetId: topic._id,
    detail: title.trim().slice(0, 80),
  });

  return successResponse({ topic }, 201, requestId);
}
