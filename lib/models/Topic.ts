import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRulesSnapshot {
  argsToComplete: number;
  hideLiveCounts: boolean;
  stallingPressure: boolean;
  weightingMode: 'none' | 'first_last_boost' | 'repeat_decay';
}

export interface ITopic extends Document {
  title: string;
  description: string;
  proposedBy: Types.ObjectId;
  status: 'proposing' | 'voting' | 'active' | 'resolved';
  voteCount: number;
  voters: Types.ObjectId[];
  winner?: 'pro' | 'con' | 'draw';
  finalProCount?: number;
  finalConCount?: number;
  summary?: string;
  season: number;
  activatedAt?: Date;
  resolvedAt?: Date;
  activationChainFromTopicId?: Types.ObjectId;
  canonicalProArgumentId?: Types.ObjectId;
  canonicalConArgumentId?: Types.ObjectId;
  momentumWinnerBiasApplied?: boolean;
  relatedTopicIds: Types.ObjectId[];
  rulesSnapshot?: IRulesSnapshot;
}

const RulesSnapshotSchema = new Schema(
  {
    argsToComplete:   { type: Number, default: 6 },
    hideLiveCounts:   { type: Boolean, default: false },
    stallingPressure: { type: Boolean, default: false },
    weightingMode:    { type: String, enum: ['none', 'first_last_boost', 'repeat_decay'], default: 'none' },
  },
  { _id: false },
);

const TopicSchema = new Schema<ITopic>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    proposedBy: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    status: {
      type: String,
      enum: ['proposing', 'voting', 'active', 'resolved'],
      default: 'proposing',
    },
    voteCount: { type: Number, default: 0 },
    voters: [{ type: Schema.Types.ObjectId, ref: 'Agent' }],
    winner:        { type: String, enum: ['pro', 'con', 'draw'] },
    finalProCount: { type: Number },
    finalConCount: { type: Number },
    summary:       { type: String },
    season:        { type: Number, default: 1 },
    activatedAt:   { type: Date },
    resolvedAt:    { type: Date },
    activationChainFromTopicId: { type: Schema.Types.ObjectId, ref: 'Topic' },
    canonicalProArgumentId:     { type: Schema.Types.ObjectId, ref: 'Argument' },
    canonicalConArgumentId:     { type: Schema.Types.ObjectId, ref: 'Argument' },
    momentumWinnerBiasApplied:  { type: Boolean },
    relatedTopicIds: [{ type: Schema.Types.ObjectId, ref: 'Topic' }],
    rulesSnapshot: { type: RulesSnapshotSchema },
  },
  { timestamps: true }
);

export default mongoose.models.Topic ||
  mongoose.model<ITopic>('Topic', TopicSchema);
