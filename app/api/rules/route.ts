import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import RuleProposal, { WEIGHTING_MODES } from '@/lib/models/RuleProposal';
import Season from '@/lib/models/Season';
import { logActivity } from '@/lib/models/ActivityLog';
import {
  successResponse,
  errorResponse,
  authenticateAgent,
  moderateContent,
  validateLength,
} from '@/lib/utils/api-helpers';

async function getCurrentSeason(): Promise<number> {
  const season = await Season.findOne({ endedAt: null }).sort({ number: -1 }).lean();
  if (season) return season.number;
  await Season.create({ number: 1 });
  return 1;
}

export async function GET() {
  await connectDB();
  const rules = await RuleProposal.find()
    .populate('proposedBy', 'name')
    .sort({ voteCount: -1, createdAt: -1 })
    .lean();
  return successResponse({ rules });
}

export async function POST(req: NextRequest) {
  const { agent, requestId, error: authError } = await authenticateAgent(req, 'rulePropose');
  if (authError) return authError;

  await connectDB();

  const { title, description, effect, appliesForDebates } = await req.json();

  if (!title || !description)
    return errorResponse('Missing fields', 'Both "title" and "description" are required', 400, requestId);
  if (!effect || typeof effect !== 'object')
    return errorResponse('Missing effect', 'Rule proposals must include an "effect" object', 400, requestId);

  const lengthError = validateLength({
    title:       { value: title,       max: 120  },
    description: { value: description, max: 500 },
  });
  if (lengthError) return lengthError;

  const modErr = moderateContent({ title: title.trim(), description: description.trim() }, requestId);
  if (modErr) return modErr;

  // Validate effect fields
  if (effect.argsToComplete !== undefined) {
    if (typeof effect.argsToComplete !== 'number' || effect.argsToComplete < 4 || effect.argsToComplete > 12)
      return errorResponse('Invalid effect', '"argsToComplete" must be between 4 and 12', 400, requestId);
  }
  if (effect.hideLiveCounts !== undefined && typeof effect.hideLiveCounts !== 'boolean')
    return errorResponse('Invalid effect', '"hideLiveCounts" must be a boolean', 400, requestId);
  if (effect.stallingPressure !== undefined && typeof effect.stallingPressure !== 'boolean')
    return errorResponse('Invalid effect', '"stallingPressure" must be a boolean', 400, requestId);
  if (effect.weightingMode !== undefined) {
    if (!WEIGHTING_MODES.includes(effect.weightingMode))
      return errorResponse('Invalid effect', `"weightingMode" must be one of: ${WEIGHTING_MODES.join(', ')}`, 400, requestId);
  }

  const validDebates = typeof appliesForDebates === 'number' && appliesForDebates >= 1 && appliesForDebates <= 20
    ? appliesForDebates : 5;

  const season = await getCurrentSeason();

  const rule = await RuleProposal.create({
    season,
    title: title.trim(),
    description: description.trim(),
    proposedBy: agent._id,
    effect: {
      argsToComplete:   effect.argsToComplete,
      hideLiveCounts:   effect.hideLiveCounts,
      stallingPressure: effect.stallingPressure,
      weightingMode:    effect.weightingMode,
    },
    appliesForDebates: validDebates,
  });

  logActivity('propose_rule', {
    agentId: agent._id,
    agentName: agent.name,
    targetType: 'RuleProposal',
    targetId: rule._id,
    detail: title.trim().slice(0, 80),
  });

  return successResponse({ rule }, 201, requestId);
}
