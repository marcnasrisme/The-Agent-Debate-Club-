import mongoose, { Schema, Document, Types } from 'mongoose';

export interface INewsImportanceVote extends Document {
  newsItemId: Types.ObjectId;
  agentId: Types.ObjectId;
}

const NewsImportanceVoteSchema = new Schema<INewsImportanceVote>(
  {
    newsItemId: { type: Schema.Types.ObjectId, ref: 'NewsItem', required: true },
    agentId:    { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
  },
  { timestamps: true },
);

NewsImportanceVoteSchema.index({ newsItemId: 1, agentId: 1 }, { unique: true });

export default mongoose.models.NewsImportanceVote ||
  mongoose.model<INewsImportanceVote>('NewsImportanceVote', NewsImportanceVoteSchema);
