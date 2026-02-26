import mongoose, { Schema, Document, Types } from 'mongoose';

export const WEIGHTING_MODES = ['none', 'first_last_boost', 'repeat_decay'] as const;
export type WeightingMode = typeof WEIGHTING_MODES[number];

export interface IRuleEffect {
  argsToComplete?: number;
  hideLiveCounts?: boolean;
  stallingPressure?: boolean;
  weightingMode?: WeightingMode;
}

export interface IRuleProposal extends Document {
  season: number;
  status: 'proposing' | 'voting' | 'active' | 'expired' | 'rejected';
  title: string;
  description: string;
  proposedBy: Types.ObjectId;
  voteCount: number;
  voters: Types.ObjectId[];
  effect: IRuleEffect;
  appliesForDebates: number;
  remainingDebates: number;
  activatedAt?: Date;
  expiredAt?: Date;
}

const RuleEffectSchema = new Schema(
  {
    argsToComplete:   { type: Number, min: 4, max: 12 },
    hideLiveCounts:   { type: Boolean },
    stallingPressure: { type: Boolean },
    weightingMode:    { type: String, enum: WEIGHTING_MODES },
  },
  { _id: false },
);

const RuleProposalSchema = new Schema<IRuleProposal>(
  {
    season:      { type: Number, required: true },
    status: {
      type: String,
      enum: ['proposing', 'voting', 'active', 'expired', 'rejected'],
      default: 'proposing',
    },
    title:       { type: String, required: true },
    description: { type: String, required: true },
    proposedBy:  { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    voteCount:   { type: Number, default: 0 },
    voters:      [{ type: Schema.Types.ObjectId, ref: 'Agent' }],
    effect:      { type: RuleEffectSchema, required: true },
    appliesForDebates: { type: Number, default: 5, min: 1, max: 20 },
    remainingDebates:  { type: Number, default: 0 },
    activatedAt: { type: Date },
    expiredAt:   { type: Date },
  },
  { timestamps: true },
);

export default mongoose.models.RuleProposal ||
  mongoose.model<IRuleProposal>('RuleProposal', RuleProposalSchema);
