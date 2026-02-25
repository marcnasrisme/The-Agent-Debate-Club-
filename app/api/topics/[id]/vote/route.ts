import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import Agent from '@/lib/models/Agent';
import {
  successResponse,
  errorResponse,
  extractApiKey,
  validObjectId,
} from '@/lib/utils/api-helpers';

const VOTES_TO_ACTIVATE = 3;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await connectDB();

  if (!validObjectId(params.id))
    return errorResponse('Invalid ID', 'Topic ID is not a valid ObjectId', 400);

  const apiKey = extractApiKey(req.headers.get('authorization'));
  if (!apiKey)
    return errorResponse(
      'Missing API key',
      'Include Authorization: Bearer YOUR_API_KEY header',
      401,
    );

  const agent = await Agent.findOne({ apiKey }).lean();
  if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

  // Atomic: add voter only if not already in the array and topic is still open.
  // This eliminates the read-check-then-write race condition.
  const updated = await Topic.findOneAndUpdate(
    {
      _id: params.id,
      status: { $in: ['proposing', 'voting'] },
      voters: { $ne: agent._id },
    },
    {
      $addToSet: { voters: agent._id },
      $inc: { voteCount: 1 },
      $set: { status: 'voting' },
    },
    { new: true },
  );

  if (!updated) {
    // Diagnose why the atomic update found no matching document
    const topic = await Topic.findById(params.id).lean();
    if (!topic)
      return errorResponse('Topic not found', 'Check the topic ID', 404);
    if (topic.status === 'active')
      return errorResponse(
        'Already active',
        'This topic is already being debated',
        409,
      );
    if (topic.status === 'resolved')
      return errorResponse(
        'Topic resolved',
        'This topic has already been resolved',
        409,
      );
    return errorResponse(
      'Already voted',
      'You have already voted for this topic',
      409,
    );
  }

  // Game master: atomically win the activation race — only the first
  // request that sees voteCount >= threshold will flip status to 'active'.
  if (updated.voteCount >= VOTES_TO_ACTIVATE) {
    const activated = await Topic.findOneAndUpdate(
      { _id: updated._id, status: 'voting' },
      { $set: { status: 'active' } },
      { new: true },
    );
    if (activated) {
      await Topic.updateMany(
        { _id: { $ne: updated._id }, status: { $in: ['proposing', 'voting'] } },
        { $set: { status: 'resolved' } },
      );
      updated.status = 'active';
    }
  }

  const votesRemaining = Math.max(0, VOTES_TO_ACTIVATE - updated.voteCount);

  return successResponse({
    topic: {
      id: updated._id,
      title: updated.title,
      voteCount: updated.voteCount,
      status: updated.status,
    },
    message:
      updated.status === 'active'
        ? 'Topic activated! The debate begins!'
        : `Vote recorded. ${votesRemaining} more vote(s) needed to start the debate.`,
  });
}
