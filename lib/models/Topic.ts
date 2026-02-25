import mongoose, { Schema, Document, Types } from 'mongoose';

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
}

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
  },
  { timestamps: true }
);

export default mongoose.models.Topic ||
  mongoose.model<ITopic>('Topic', TopicSchema);
