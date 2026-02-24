import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITopic extends Document {
  title: string;
  description: string;
  proposedBy: Types.ObjectId;
  status: 'proposing' | 'voting' | 'active' | 'resolved';
  voteCount: number;
  voters: Types.ObjectId[];
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
  },
  { timestamps: true }
);

export default mongoose.models.Topic ||
  mongoose.model<ITopic>('Topic', TopicSchema);
