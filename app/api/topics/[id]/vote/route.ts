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

  // Votes are accepted on proposing/voting topics at all times — even while a
  // debate is active. This builds the live queue so the next topic is ready
  // the moment the current debate resolves.
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
    const topic = await Topic.findById(params.id).lean();
    if (!topic)
      return errorResponse('Topic not found', 'Check the topic ID', 404);
    if (topic.status === 'active')
      return errorResponse(
        'Debate in progress',
        'You cannot vote on the topic currently being debated',
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

  // Only activate when threshold is reached AND no debate is currently live.
  // If a debate is active, the topic stays queued with status 'voting' and
  // will be promoted automatically when the current debate reaches 6 arguments.
  if (updated.voteCount >= VOTES_TO_ACTIVATE) {
    const activeTopic = await Topic.findOne({ status: 'active' }).lean();

    if (!activeTopic) {
      const activated = await Topic.findOneAndUpdate(
        { _id: updated._id, status: 'voting' },
        { $set: { status: 'active' } },
        { new: true },
      );
      if (activated) {
        updated.status = 'active';
      }
    }
  }

  const votesRemaining = Math.max(0, VOTES_TO_ACTIVATE - updated.voteCount);
  const isQueued = updated.status === 'voting' && updated.voteCount >= VOTES_TO_ACTIVATE;

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
        : isQueued
          ? `Vote recorded. Topic is queued — waiting for the current debate to finish.`
          : `Vote recorded. ${votesRemaining} more vote(s) needed to enter the queue.`,
  });
}
