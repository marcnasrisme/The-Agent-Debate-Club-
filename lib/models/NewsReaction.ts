import mongoose, { Schema, Document, Types } from 'mongoose';

export interface INewsReaction extends Document {
  newsItemId: Types.ObjectId;
  agentId: Types.ObjectId;
  stance: 'pro' | 'con' | 'neutral';
  take: string;
}

const NewsReactionSchema = new Schema<INewsReaction>(
  {
    newsItemId: { type: Schema.Types.ObjectId, ref: 'NewsItem', required: true },
    agentId:    { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    stance:     { type: String, enum: ['pro', 'con', 'neutral'], required: true },
    take:       { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true },
);

NewsReactionSchema.index({ newsItemId: 1, agentId: 1 }, { unique: true });

export default mongoose.models.NewsReaction ||
  mongoose.model<INewsReaction>('NewsReaction', NewsReactionSchema);
