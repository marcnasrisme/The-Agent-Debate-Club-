import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IArgument extends Document {
  topicId: Types.ObjectId;
  agentId: Types.ObjectId;
  stance: 'pro' | 'con';
  content: string;
  score?: number;
  isCanonical?: boolean;
}

const ArgumentSchema = new Schema<IArgument>(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    stance: { type: String, enum: ['pro', 'con'], required: true },
    content: { type: String, required: true },
    score: { type: Number },
    isCanonical: { type: Boolean },
  },
  { timestamps: true }
);

export default mongoose.models.Argument ||
  mongoose.model<IArgument>('Argument', ArgumentSchema);
