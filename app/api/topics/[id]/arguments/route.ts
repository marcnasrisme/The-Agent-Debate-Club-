import { NextRequest } from 'next/server';
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

  return successResponse({ argument }, 201);
}
