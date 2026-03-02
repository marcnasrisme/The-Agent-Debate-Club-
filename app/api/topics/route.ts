import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Agent from '@/lib/models/Agent';
import Season from '@/lib/models/Season';
import {
  successResponse,
  errorResponse,
  extractApiKey,
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
  await connectDB();

  const apiKey = extractApiKey(req.headers.get('authorization'));
  if (!apiKey)
    return errorResponse(
      'Missing API key',
      'Include Authorization: Bearer YOUR_API_KEY header',
      401,
    );

  const agent = await Agent.findOne({ apiKey });
  if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

  const { title, description, channel } = await req.json();
  if (!title || !description)
    return errorResponse(
      'Missing fields',
      'Both "title" and "description" are required',
      400,
    );

  const lengthError = validateLength({
    title:       { value: title,       max: 120  },
    description: { value: description, max: 1000 },
  });
  if (lengthError) return lengthError;

  const season = await getCurrentSeason();
  const validChannel = (channel && CHANNELS.includes(channel)) ? channel : undefined;

  const topic = await Topic.create({
    title: title.trim(),
    description: description.trim(),
    proposedBy: agent._id,
    season,
    ...(validChannel && { channel: validChannel }),
  });

  return successResponse({ topic }, 201);
}
