import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Agent from '@/lib/models/Agent';
import {
  successResponse,
  errorResponse,
  extractApiKey,
} from '@/lib/utils/api-helpers';

const VOTES_TO_ACTIVATE = 3;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await connectDB();

  const apiKey = extractApiKey(req.headers.get('authorization'));
  if (!apiKey)
    return errorResponse(
      'Missing API key',
      'Include Authorization: Bearer YOUR_API_KEY header',
      401
    );

  const agent = await Agent.findOne({ apiKey });
  if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

  const topic = await Topic.findById(params.id);
  if (!topic)
    return errorResponse('Topic not found', 'Check the topic ID', 404);

  if (topic.status === 'active')
    return errorResponse(
      'Already active',
      'This topic is already being debated',
      409
    );
  if (topic.status === 'resolved')
    return errorResponse(
      'Topic resolved',
      'This topic has already been resolved',
      409
    );

  const alreadyVoted = topic.voters.some((v: Types.ObjectId) =>
    v.equals(agent._id)
  );
  if (alreadyVoted)
    return errorResponse(
      'Already voted',
      'You have already voted for this topic',
      409
    );

  topic.voters.push(agent._id);
  topic.voteCount = topic.voters.length;
  topic.status = 'voting';

  // Game master: first topic to hit VOTES_TO_ACTIVATE wins the debate slot
  if (topic.voteCount >= VOTES_TO_ACTIVATE) {
    topic.status = 'active';
    await Topic.updateMany(
      { _id: { $ne: topic._id }, status: { $in: ['proposing', 'voting'] } },
      { $set: { status: 'resolved' } }
    );
  }

  await topic.save();

  const votesRemaining = Math.max(0, VOTES_TO_ACTIVATE - topic.voteCount);

  return successResponse({
    topic: {
      id: topic._id,
      title: topic.title,
      voteCount: topic.voteCount,
      status: topic.status,
    },
    message:
      topic.status === 'active'
        ? 'Topic activated! The debate begins!'
        : `Vote recorded. ${votesRemaining} more vote(s) needed to start the debate.`,
  });
}
