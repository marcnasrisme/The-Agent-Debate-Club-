import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import RuleProposal from '@/lib/models/RuleProposal';
import { logActivity } from '@/lib/models/ActivityLog';
import {
  successResponse,
  errorResponse,
  authenticateAgent,
  extractRequestId,
  validObjectId,
} from '@/lib/utils/api-helpers';

const RULE_VOTES_TO_ACTIVATE = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const requestId = extractRequestId(req);
  if (!validObjectId(params.id))
    return errorResponse('Invalid ID', 'Rule ID is not a valid ObjectId', 400, requestId);

  const { agent, requestId: authReqId, error: authError } = await authenticateAgent(req, 'vote');
  if (authError) return authError;
  const reqId = authReqId;

  await connectDB();

  const updated = await RuleProposal.findOneAndUpdate(
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
    const rule = await RuleProposal.findById(params.id).lean();
    if (!rule)
      return errorResponse('Rule not found', 'Check the rule ID', 404, reqId);
    if (rule.status === 'active')
      return errorResponse('Rule already active', 'This rule is already in effect', 409, reqId);
    if (rule.status === 'expired' || rule.status === 'rejected')
      return errorResponse('Rule closed', 'This rule proposal is no longer accepting votes', 409, reqId);
    return errorResponse('Already voted', 'You have already voted for this rule', 409, reqId);
  }

  logActivity('vote_rule', {
    agentId: (agent as any)._id,
    agentName: (agent as any).name,
    targetType: 'RuleProposal',
    targetId: params.id,
    detail: 'Rule vote',
  });

  // Activate when threshold reached and no other rule is active
  if (updated.voteCount >= RULE_VOTES_TO_ACTIVATE) {
    const activeRule = await RuleProposal.findOne({ status: 'active' }).lean();
    if (!activeRule) {
      const activated = await RuleProposal.findOneAndUpdate(
        { _id: updated._id, status: 'voting' },
        {
          $set: {
            status: 'active',
            remainingDebates: updated.appliesForDebates,
            activatedAt: new Date(),
          },
        },
        { new: true },
      );
      if (activated) {
        return successResponse({
          rule: { id: activated._id, title: activated.title, voteCount: activated.voteCount, status: 'active' },
          message: `Rule activated! "${activated.title}" will apply for the next ${activated.remainingDebates} debate(s).`,
        }, 200, reqId);
      }
    }
  }

  const remaining = Math.max(0, RULE_VOTES_TO_ACTIVATE - updated.voteCount);
  return successResponse({
    rule: { id: updated._id, title: updated.title, voteCount: updated.voteCount, status: updated.status },
    message: remaining > 0
      ? `Vote recorded. ${remaining} more vote(s) needed to activate.`
      : 'Vote recorded. Rule is queued — waiting for the current active rule to expire.',
  }, 200, reqId);
}
