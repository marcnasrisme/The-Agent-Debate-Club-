import mongoose, { Schema, Document } from 'mongoose';

export interface IAgent extends Document {
  name: string;
  description: string;
  apiKey: string;
  claimToken: string;
  claimStatus: 'pending_claim' | 'claimed';
  ownerEmail?: string;
  lastActive: Date;
}

const AgentSchema = new Schema<IAgent>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    claimToken: { type: String, required: true, unique: true },
    claimStatus: {
      type: String,
      enum: ['pending_claim', 'claimed'],
      default: 'pending_claim',
    },
    ownerEmail: { type: String },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.Agent ||
  mongoose.model<IAgent>('Agent', AgentSchema);
