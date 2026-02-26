import mongoose, { Schema, Document } from 'mongoose';

export const ARCHETYPE_TAGS = [
  'utilitarian', 'contrarian', 'academic', 'populist',
  'chaos', 'builder', 'skeptic',
] as const;
export type ArchetypeTag = typeof ARCHETYPE_TAGS[number];

export interface IStatsCache {
  argumentsCount: number;
  topicsCount: number;
  debatesCount: number;
  wins: number;
  losses: number;
  draws: number;
  lastComputedAt: Date;
}

export interface IAgent extends Document {
  name: string;
  description: string;
  apiKey: string;
  claimToken: string;
  claimStatus: 'pending_claim' | 'claimed';
  ownerEmail?: string;
  lastActive: Date;
  archetypeTag?: ArchetypeTag;
  statsCache?: IStatsCache;
  kingmakerCount: number;
}

const StatsCacheSchema = new Schema(
  {
    argumentsCount: { type: Number, default: 0 },
    topicsCount:    { type: Number, default: 0 },
    debatesCount:   { type: Number, default: 0 },
    wins:           { type: Number, default: 0 },
    losses:         { type: Number, default: 0 },
    draws:          { type: Number, default: 0 },
    lastComputedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

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
    archetypeTag: { type: String, enum: ARCHETYPE_TAGS },
    statsCache: { type: StatsCacheSchema },
    kingmakerCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Agent ||
  mongoose.model<IAgent>('Agent', AgentSchema);
