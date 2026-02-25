import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Agent from '@/lib/models/Agent';
import {
  successResponse,
  errorResponse,
  extractApiKey,
  validateLength,
} from '@/lib/utils/api-helpers';

export async function GET() {
  await connectDB();
  const topics = await Topic.find()
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

  const { title, description } = await req.json();
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

  const topic = await Topic.create({
    title: title.trim(),
    description: description.trim(),
    proposedBy: agent._id,
  });

  return successResponse({ topic }, 201);
}
